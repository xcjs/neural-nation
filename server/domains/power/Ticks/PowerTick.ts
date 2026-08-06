import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '../../../db/schema';
import { greatCircleDistance } from '../../../shared/geo/distance';
import { logGameEvent } from '../../events/logGameEvent';
import { EXTRACTOR_TYPES, POWER_GENERATING_TYPES } from '../../shared/constants/facilityTypes';
import { applyTransmissionLoss, computeConnectedComponents, computeGridThrottle, solarOutputFactor } from '../gridTopology';

interface FacilityPowerRow {
  id: number;
  type: string;
  lat: number;
  lon: number;
  targetOutputRate: number;
  powerConsumption: number;
  powerConnected: number;
  powerThrottle: number;
}

interface PowerLineEdge {
  fromFacilityId: number;
  toFacilityId: number;
}

export class PowerTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(tick: number): void {
    const facilities = this.db.select({
      id: schema.facilities.id,
      type: schema.facilities.type,
      lat: schema.facilities.lat,
      lon: schema.facilities.lon,
      targetOutputRate: schema.facilities.targetOutputRate,
      powerConsumption: schema.facilities.powerConsumption,
      powerConnected: schema.facilities.powerConnected,
      powerThrottle: schema.facilities.powerThrottle,
    }).from(schema.facilities).where(eq(schema.facilities.status, 'Active')).all() as FacilityPowerRow[];

    const powerLines = this.db.select({
      fromFacilityId: schema.transports.fromFacilityId,
      toFacilityId: schema.transports.toFacilityId,
    }).from(schema.transports).where(eq(schema.transports.type, 'PowerLine')).all() as PowerLineEdge[];

    const facilityIds = facilities.map(f => f.id);
    const components = computeConnectedComponents(facilityIds, powerLines);

    const facilityMap = new Map(facilities.map(f => [f.id, f]));

    for (const component of components) {
      this.processGrid(component, facilityMap, powerLines, tick);
    }
  }

  private processGrid(
    component: number[],
    facilityMap: Map<number, FacilityPowerRow>,
    powerLines: PowerLineEdge[],
    tick: number,
  ): void {
    const gridFacilities = component
      .map(id => facilityMap.get(id))
      .filter((f): f is FacilityPowerRow => f !== undefined);

    const generators = gridFacilities.filter(f => POWER_GENERATING_TYPES.has(f.type));
    const consumers = gridFacilities.filter(f => f.powerConsumption > 0);
    const others = gridFacilities.filter(
      f => !POWER_GENERATING_TYPES.has(f.type) && f.powerConsumption === 0,
    );

    if (generators.length === 0) {
      for (const f of gridFacilities) {
        const isGenerator = POWER_GENERATING_TYPES.has(f.type);
        const isExtractor = EXTRACTOR_TYPES.has(f.type);
        this.updateFacility(f.id, isGenerator ? 1 : 0, isExtractor ? 1.0 : 0);
      }
      return;
    }

    let totalCapacity = 0;
    for (const gen of generators) {
      const rated = gen.targetOutputRate || 0;
      if (gen.type === 'SolarFarm') {
        totalCapacity += rated * solarOutputFactor(gen.lat);
      }
      else {
        totalCapacity += rated;
      }
    }

    const totalDemand = consumers.reduce((sum, c) => sum + c.powerConsumption, 0);

    if (totalCapacity < totalDemand) {
      const deficit = totalDemand - totalCapacity;
      const energyStockpile = this.db.select().from(schema.stockpiles).where(
        and(
          eq(schema.stockpiles.resourceKey, 'energy'),
          sql`${schema.stockpiles.facilityId} IS NULL`,
        ),
      ).all();
      const available = energyStockpile.reduce((sum, s) => sum + s.quantity, 0);
      if (available > 0) {
        const drawn = Math.min(deficit, available);
        totalCapacity += drawn;
        const toDeduct = drawn;
        let remaining = toDeduct;
        for (const s of energyStockpile) {
          if (remaining <= 0)
            break;
          const deduct = Math.min(remaining, s.quantity);
          this.db.update(schema.stockpiles)
            .set({ quantity: s.quantity - deduct })
            .where(eq(schema.stockpiles.id, s.id))
            .run();
          remaining -= deduct;
        }
      }
    }

    const gridEdges = powerLines.filter(
      e => component.includes(e.fromFacilityId) && component.includes(e.toFacilityId),
    );
    if (gridEdges.length > 0 && generators.length > 0 && consumers.length > 0) {
      let totalDist = 0;
      for (const edge of gridEdges) {
        const from = facilityMap.get(edge.fromFacilityId);
        const to = facilityMap.get(edge.toFacilityId);
        if (from && to) {
          totalDist += greatCircleDistance(from.lat, from.lon, to.lat, to.lon);
        }
      }
      const avgEdgeDist = totalDist / gridEdges.length;
      const maxHops = component.length - 1;
      totalCapacity = applyTransmissionLoss(totalCapacity, avgEdgeDist, maxHops);
    }

    const hasPower = totalCapacity > 0;
    const { throttle } = computeGridThrottle(totalCapacity, totalDemand);

    if (!hasPower && consumers.length > 0) {
      logGameEvent(this.db, tick, 'power_blackout', `Power blackout on grid with ${consumers.length} consumers (demand ${totalDemand}, capacity 0)`, 'critical');
    }
    else if (hasPower && throttle < 1 && consumers.length > 0) {
      logGameEvent(this.db, tick, 'power_brownout', `Power brownout on grid with ${consumers.length} consumers (demand ${totalDemand}, capacity ${totalCapacity.toFixed(1)}, throttle ${(throttle * 100).toFixed(0)}%)`, 'warning');
    }

    for (const gen of generators) {
      this.updateFacility(gen.id, 1, 1.0);
    }
    for (const consumer of consumers) {
      this.updateFacility(consumer.id, hasPower ? 1 : 0, hasPower ? throttle : 0);
    }
    for (const other of others) {
      const isExtractor = EXTRACTOR_TYPES.has(other.type);
      this.updateFacility(other.id, hasPower ? 1 : 0, isExtractor ? 1.0 : (hasPower ? throttle : 0));
    }
  }

  private updateFacility(id: number, powerConnected: number, powerThrottle: number): void {
    this.db.update(schema.facilities)
      .set({ powerConnected, powerThrottle })
      .where(eq(schema.facilities.id, id))
      .run();
  }
}
