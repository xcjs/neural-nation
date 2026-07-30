import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { eq } from 'drizzle-orm';
import { schema } from '../../../db/schema';
import { greatCircleDistance } from '../../../shared/geo/distance';
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

  process(_tick: number): void {
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
      this.processGrid(component, facilityMap, powerLines);
    }
  }

  private processGrid(
    component: number[],
    facilityMap: Map<number, FacilityPowerRow>,
    powerLines: PowerLineEdge[],
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
