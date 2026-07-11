import type { PaginatedResult, PaginationParams } from '../../../lib/types/mcp';
import type { TerrainCell, TerrainModification } from '../../../lib/types/terrain';
import type { schema } from '../../db/schema';
import type { ITerrainRepository } from './Repositories/ITerrainRepository';
import { TerraformAction } from '../../../lib/types/terrain';

export class TerrainService {
  constructor(private readonly terrainRepo: ITerrainRepository) {}

  getEffectiveTerrain(lat: number, lon: number): {
    lat: number;
    lon: number;
    baseElevation: number;
    effectiveElevation: number;
    baseTerrainClass: string;
    effectiveTerrainClass: string;
    modifications: Array<typeof schema.terrainModifications.$inferSelect>;
  } | null {
    const baseCell = this.terrainRepo.getTerrainCellNear(lat, lon);

    if (!baseCell)
      return null;

    const mods = this.terrainRepo.getTerrainModificationsForCell(baseCell.latIndex, baseCell.lonIndex);

    const elevationDelta = mods.reduce((sum, m) => sum + m.elevationDelta, 0);
    const effectiveElevation = baseCell.elevation + elevationDelta;

    let effectiveClass = baseCell.terrainClass;
    const lastClassMod = mods.findLast(m => m.newTerrainClass !== null);
    if (lastClassMod?.newTerrainClass) {
      effectiveClass = lastClassMod.newTerrainClass;
    }
    else {
      effectiveClass = this.classifyByElevation(effectiveElevation);
    }

    return {
      lat: baseCell.lat,
      lon: baseCell.lon,
      baseElevation: baseCell.elevation,
      effectiveElevation,
      baseTerrainClass: baseCell.terrainClass,
      effectiveTerrainClass: effectiveClass,
      modifications: mods,
    };
  }

  getTerrainPath(
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
  ): { cells: TerrainCell[]; modifiers: string[]; distance: number } {
    const latMin = Math.min(fromLat, toLat);
    const latMax = Math.max(fromLat, toLat);
    const lonMin = Math.min(fromLon, toLon);
    const lonMax = Math.max(fromLon, toLon);

    const cells = this.terrainRepo.getTerrainInBoundingBox(latMin, latMax, lonMin, lonMax);

    const modifiers: string[] = [];

    for (const cell of cells) {
      const effective = this.getEffectiveTerrain(cell.lat, cell.lon);
      const terrainClass = effective?.effectiveTerrainClass || cell.terrainClass;

      if (terrainClass === 'Mountain' || terrainClass === 'HighMountain') {
        if (!modifiers.includes('tunnel'))
          modifiers.push('tunnel');
      }
      if (terrainClass === 'Ocean') {
        if (!modifiers.includes('bridge'))
          modifiers.push('bridge');
      }
    }

    const distance = Math.sqrt(
      (toLat - fromLat) ** 2 + (toLon - fromLon) ** 2,
    ) * 111;

    return { cells: cells as unknown as TerrainCell[], modifiers, distance };
  }

  terraform(
    action: TerraformAction,
    params: {
      facilityId: number;
      targetCells: Array<{ latIndex: number; lonIndex: number }>;
    },
  ): { modificationsApplied: number; operationId: string } {
    const tick = this.terrainRepo.getMetaTickCount();

    const operationId = `terraform-${tick}-${params.facilityId}`;
    let modificationsApplied = 0;

    for (const target of params.targetCells) {
      const { elevationDelta, newTerrainClass } = this.getTerraformEffect(action);

      this.terrainRepo.insertTerrainModification({
        latIndex: target.latIndex,
        lonIndex: target.lonIndex,
        elevationDelta,
        newTerrainClass,
        modifiedBy: String(params.facilityId),
        modifiedAtTick: tick,
        operationId,
        reason: action,
      });

      modificationsApplied++;
    }

    return { modificationsApplied, operationId };
  }

  getTerrainModifications(params: PaginationParams = {}): PaginatedResult<TerrainModification> {
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const items = this.terrainRepo.getTerrainModifications(limit, offset);
    const totalCount = this.terrainRepo.countTerrainModifications();

    return {
      items: items as unknown as TerrainModification[],
      totalCount,
      limit,
      offset,
      hasMore: offset + items.length < totalCount,
    };
  }

  getTerraformCostEstimate(
    action: TerraformAction,
    _params: { targetCells: Array<{ latIndex: number; lonIndex: number }> },
  ): { costs: Array<{ resourceKey: string; quantity: number; unit: string }>; environmentalImpact: string; estimatedIncidents: string[] } {
    const { costs, environmentalImpact, estimatedIncidents } = this.getTerraformDefaults(action);
    return { costs, environmentalImpact, estimatedIncidents };
  }

  private getTerraformEffect(action: TerraformAction): { elevationDelta: number; newTerrainClass: string | null } {
    switch (action) {
      case TerraformAction.FlattenTerrain:
        return { elevationDelta: -50, newTerrainClass: 'Plain' };
      case TerraformAction.DigCanal:
        return { elevationDelta: -100, newTerrainClass: 'Ocean' };
      case TerraformAction.BuildRoadEmbankment:
        return { elevationDelta: 20, newTerrainClass: 'Plain' };
      case TerraformAction.CreateReservoir:
        return { elevationDelta: -30, newTerrainClass: 'Ocean' };
      case TerraformAction.DrainArea:
        return { elevationDelta: 30, newTerrainClass: 'Plain' };
      case TerraformAction.DivertRiver:
        return { elevationDelta: -20, newTerrainClass: 'Ocean' };
      case TerraformAction.LevelMountain:
        return { elevationDelta: -1000, newTerrainClass: 'Plain' };
      case TerraformAction.RaiseLand:
        return { elevationDelta: 100, newTerrainClass: 'Plain' };
      case TerraformAction.ExcavateMineShaft:
        return { elevationDelta: -200, newTerrainClass: null };
      case TerraformAction.CreateMountain:
        return { elevationDelta: 1000, newTerrainClass: 'Mountain' };
      case TerraformAction.ShiftContinentalPlate:
        return { elevationDelta: 500, newTerrainClass: null };
      case TerraformAction.OceanToLand:
        return { elevationDelta: 200, newTerrainClass: 'Coastal' };
      case TerraformAction.LandToOcean:
        return { elevationDelta: -200, newTerrainClass: 'Ocean' };
      default:
        return { elevationDelta: 0, newTerrainClass: null };
    }
  }

  private getTerraformDefaults(action: TerraformAction): {
    costs: Array<{ resourceKey: string; quantity: number; unit: string }>;
    environmentalImpact: string;
    estimatedIncidents: string[];
  } {
    switch (action) {
      case TerraformAction.FlattenTerrain:
        return {
          costs: [{ resourceKey: 'Fuel', quantity: 5, unit: 't' }, { resourceKey: 'Machinery', quantity: 2, unit: 't' }],
          environmentalImpact: 'Low - minor surface disruption',
          estimatedIncidents: [],
        };
      case TerraformAction.LevelMountain:
        return {
          costs: [{ resourceKey: 'Machinery', quantity: 50, unit: 't' }, { resourceKey: 'Explosives', quantity: 20, unit: 't' }, { resourceKey: 'Fuel', quantity: 100, unit: 't' }],
          environmentalImpact: 'Extreme - total ecosystem destruction in target area',
          estimatedIncidents: ['ecological_collapse', 'climate_shift'],
        };
      case TerraformAction.ShiftContinentalPlate:
        return {
          costs: [{ resourceKey: 'Machinery', quantity: 500, unit: 't' }, { resourceKey: 'Fuel', quantity: 1000, unit: 't' }, { resourceKey: 'FusionCore', quantity: 5, unit: 't' }],
          environmentalImpact: 'Catastrophic - global-scale environmental disruption',
          estimatedIncidents: ['ecological_collapse', 'climate_shift', 'water_contamination'],
        };
      default:
        return {
          costs: [{ resourceKey: 'Machinery', quantity: 10, unit: 't' }, { resourceKey: 'Fuel', quantity: 20, unit: 't' }],
          environmentalImpact: 'Moderate',
          estimatedIncidents: [],
        };
    }
  }

  private classifyByElevation(elevation: number): string {
    if (elevation < 0)
      return 'Ocean';
    if (elevation < 200)
      return 'Coastal';
    if (elevation < 800)
      return 'Plain';
    if (elevation < 1500)
      return 'Hill';
    if (elevation < 3000)
      return 'Mountain';
    return 'HighMountain';
  }
}
