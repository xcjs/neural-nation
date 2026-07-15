import type { FacilityDetail, FacilitySummary } from '../../../lib/types/facility';
import type { PaginatedResult, PaginationParams } from '../../../lib/types/mcp';
import type { ConstructionCost } from './Models/ConstructionCost';
import type { FacilityBufferEntry } from './Models/FacilityBuffer';
import type { FacilityRow, IFacilityRepository, SearchFacilitiesParams } from './Repositories/IFacilityRepository';
import { FacilityStatus } from '../../../lib/types/facility';
import { greatCircleDistance } from '../../shared/geo/distance';

const POWER_GENERATING_TYPES = new Set([
  'PowerPlant',
  'SolarFarm',
  'WindFarm',
  'HydroPlant',
  'NuclearReactor',
  'BreederReactor',
  'FusionReactor',
  'BiomassPlant',
  'BiogasPlant',
  'DieselGenerator',
  'CoalPlant',
  'GasPlant',
  'OilPlant',
  'GeothermalPlant',
]);

const FACILITY_TECH_REQUIREMENTS: Record<string, string> = {
  AdvancedFactory: 'precision_manufacturing',
  NuclearReactor: 'nuclear_power',
  BreederReactor: 'nuclear_power',
  FusionReactor: 'fusion_power',
  Spaceport: 'aerospace_engineering',
  RocketAssembly: 'aerospace_engineering',
  SpaceStation: 'aerospace_engineering',
  OrbitalRefinery: 'aerospace_engineering',
  LunarMine: 'aerospace_engineering',
  DeepSpaceProbe: 'aerospace_engineering',
  SpaceHabitat: 'aerospace_engineering',
  Terraformer: 'advanced_terraforming',
  PlanetaryEngine: 'planetary_engineering',
  Excavator: 'earthworks',
  Dredger: 'hydraulic_engineering',
};

const CONSTRUCTION_COSTS: Record<string, ConstructionCost[]> = {
  Extractor: [{ resourceKey: 'steel', quantity: 2, unit: 't' }, { resourceKey: 'concrete', quantity: 3, unit: 't' }],
  Farm: [{ resourceKey: 'steel', quantity: 1, unit: 't' }, { resourceKey: 'concrete', quantity: 2, unit: 't' }],
  Forestry: [{ resourceKey: 'steel', quantity: 1, unit: 't' }, { resourceKey: 'concrete', quantity: 1, unit: 't' }],
  WaterPump: [{ resourceKey: 'steel', quantity: 1, unit: 't' }, { resourceKey: 'concrete', quantity: 2, unit: 't' }],
  Processor: [{ resourceKey: 'steel', quantity: 3, unit: 't' }, { resourceKey: 'concrete', quantity: 5, unit: 't' }],
  Smelter: [{ resourceKey: 'steel', quantity: 3, unit: 't' }, { resourceKey: 'concrete', quantity: 5, unit: 't' }],
  Refinery: [{ resourceKey: 'steel', quantity: 4, unit: 't' }, { resourceKey: 'concrete', quantity: 5, unit: 't' }],
  Factory: [{ resourceKey: 'steel', quantity: 5, unit: 't' }, { resourceKey: 'concrete', quantity: 8, unit: 't' }, { resourceKey: 'machinery', quantity: 1, unit: 't' }],
  AdvancedFactory: [{ resourceKey: 'steel', quantity: 8, unit: 't' }, { resourceKey: 'concrete', quantity: 10, unit: 't' }, { resourceKey: 'machinery', quantity: 2, unit: 't' }, { resourceKey: 'electronics', quantity: 1, unit: 't' }],
  ChemicalPlant: [{ resourceKey: 'steel', quantity: 4, unit: 't' }, { resourceKey: 'concrete', quantity: 6, unit: 't' }, { resourceKey: 'machinery', quantity: 1, unit: 't' }],
  ResearchLab: [{ resourceKey: 'steel', quantity: 5, unit: 't' }, { resourceKey: 'concrete', quantity: 8, unit: 't' }, { resourceKey: 'machinery', quantity: 2, unit: 't' }],
  PowerPlant: [{ resourceKey: 'steel', quantity: 5, unit: 't' }, { resourceKey: 'concrete', quantity: 10, unit: 't' }, { resourceKey: 'machinery', quantity: 2, unit: 't' }],
  SolarFarm: [{ resourceKey: 'steel', quantity: 2, unit: 't' }, { resourceKey: 'concrete', quantity: 3, unit: 't' }],
  WindFarm: [{ resourceKey: 'steel', quantity: 3, unit: 't' }, { resourceKey: 'concrete', quantity: 4, unit: 't' }],
  HydroPlant: [{ resourceKey: 'steel', quantity: 8, unit: 't' }, { resourceKey: 'concrete', quantity: 15, unit: 't' }, { resourceKey: 'machinery', quantity: 3, unit: 't' }],
  NuclearReactor: [{ resourceKey: 'steel', quantity: 10, unit: 't' }, { resourceKey: 'concrete', quantity: 20, unit: 't' }, { resourceKey: 'machinery', quantity: 3, unit: 't' }, { resourceKey: 'electronics', quantity: 2, unit: 't' }],
  BreederReactor: [{ resourceKey: 'steel', quantity: 12, unit: 't' }, { resourceKey: 'concrete', quantity: 25, unit: 't' }, { resourceKey: 'machinery', quantity: 4, unit: 't' }, { resourceKey: 'electronics', quantity: 3, unit: 't' }],
  FusionReactor: [{ resourceKey: 'steel', quantity: 20, unit: 't' }, { resourceKey: 'concrete', quantity: 30, unit: 't' }, { resourceKey: 'machinery', quantity: 5, unit: 't' }, { resourceKey: 'electronics', quantity: 5, unit: 't' }, { resourceKey: 'alloys', quantity: 2, unit: 't' }],
  BiomassPlant: [{ resourceKey: 'steel', quantity: 3, unit: 't' }, { resourceKey: 'concrete', quantity: 4, unit: 't' }],
  BiogasPlant: [{ resourceKey: 'steel', quantity: 3, unit: 't' }, { resourceKey: 'concrete', quantity: 4, unit: 't' }],
  EthanolRefinery: [{ resourceKey: 'steel', quantity: 4, unit: 't' }, { resourceKey: 'concrete', quantity: 6, unit: 't' }, { resourceKey: 'machinery', quantity: 1, unit: 't' }],
  SoylentPlant: [{ resourceKey: 'steel', quantity: 4, unit: 't' }, { resourceKey: 'concrete', quantity: 6, unit: 't' }, { resourceKey: 'machinery', quantity: 1, unit: 't' }],
  DieselGenerator: [{ resourceKey: 'steel', quantity: 2, unit: 't' }, { resourceKey: 'machinery', quantity: 1, unit: 't' }],
  CoalPlant: [{ resourceKey: 'steel', quantity: 5, unit: 't' }, { resourceKey: 'concrete', quantity: 8, unit: 't' }, { resourceKey: 'machinery', quantity: 2, unit: 't' }],
  GasPlant: [{ resourceKey: 'steel', quantity: 4, unit: 't' }, { resourceKey: 'concrete', quantity: 6, unit: 't' }, { resourceKey: 'machinery', quantity: 2, unit: 't' }],
  OilPlant: [{ resourceKey: 'steel', quantity: 4, unit: 't' }, { resourceKey: 'concrete', quantity: 6, unit: 't' }, { resourceKey: 'machinery', quantity: 2, unit: 't' }],
  GeothermalPlant: [{ resourceKey: 'steel', quantity: 6, unit: 't' }, { resourceKey: 'concrete', quantity: 10, unit: 't' }, { resourceKey: 'machinery', quantity: 2, unit: 't' }],
  Storage: [{ resourceKey: 'steel', quantity: 2, unit: 't' }, { resourceKey: 'concrete', quantity: 4, unit: 't' }],
  BatteryBank: [{ resourceKey: 'steel', quantity: 3, unit: 't' }, { resourceKey: 'electronics', quantity: 1, unit: 't' }],
  Spaceport: [{ resourceKey: 'steel', quantity: 15, unit: 't' }, { resourceKey: 'concrete', quantity: 20, unit: 't' }, { resourceKey: 'machinery', quantity: 5, unit: 't' }, { resourceKey: 'electronics', quantity: 3, unit: 't' }, { resourceKey: 'fuel', quantity: 10, unit: 't' }],
  RocketAssembly: [{ resourceKey: 'steel', quantity: 10, unit: 't' }, { resourceKey: 'machinery', quantity: 3, unit: 't' }, { resourceKey: 'electronics', quantity: 2, unit: 't' }, { resourceKey: 'fuel', quantity: 5, unit: 't' }],
  SpaceStation: [{ resourceKey: 'steel', quantity: 20, unit: 't' }, { resourceKey: 'alloys', quantity: 5, unit: 't' }, { resourceKey: 'electronics', quantity: 5, unit: 't' }, { resourceKey: 'composites', quantity: 3, unit: 't' }],
  OrbitalRefinery: [{ resourceKey: 'steel', quantity: 15, unit: 't' }, { resourceKey: 'machinery', quantity: 3, unit: 't' }, { resourceKey: 'electronics', quantity: 3, unit: 't' }],
  LunarMine: [{ resourceKey: 'steel', quantity: 12, unit: 't' }, { resourceKey: 'machinery', quantity: 3, unit: 't' }, { resourceKey: 'composites', quantity: 2, unit: 't' }],
  DeepSpaceProbe: [{ resourceKey: 'steel', quantity: 8, unit: 't' }, { resourceKey: 'electronics', quantity: 4, unit: 't' }, { resourceKey: 'composites', quantity: 2, unit: 't' }],
  SpaceHabitat: [{ resourceKey: 'steel', quantity: 25, unit: 't' }, { resourceKey: 'alloys', quantity: 8, unit: 't' }, { resourceKey: 'composites', quantity: 5, unit: 't' }, { resourceKey: 'electronics', quantity: 5, unit: 't' }],
  Excavator: [{ resourceKey: 'steel', quantity: 5, unit: 't' }, { resourceKey: 'machinery', quantity: 2, unit: 't' }],
  Dredger: [{ resourceKey: 'steel', quantity: 5, unit: 't' }, { resourceKey: 'machinery', quantity: 2, unit: 't' }],
  Terraformer: [{ resourceKey: 'steel', quantity: 10, unit: 't' }, { resourceKey: 'machinery', quantity: 5, unit: 't' }, { resourceKey: 'electronics', quantity: 3, unit: 't' }, { resourceKey: 'alloys', quantity: 2, unit: 't' }],
  PlanetaryEngine: [{ resourceKey: 'steel', quantity: 30, unit: 't' }, { resourceKey: 'concrete', quantity: 50, unit: 't' }, { resourceKey: 'machinery', quantity: 10, unit: 't' }, { resourceKey: 'electronics', quantity: 5, unit: 't' }, { resourceKey: 'alloys', quantity: 5, unit: 't' }, { resourceKey: 'composites', quantity: 3, unit: 't' }],
};

function normalizeFacilityType(type: string): string {
  const trimmed = type.trim();
  if (trimmed in CONSTRUCTION_COSTS)
    return trimmed;
  const pascal = trimmed
    .toLowerCase()
    .replace(/(^|[_\s-])(\w)/g, (_, __, c: string) => c.toUpperCase());
  if (pascal in CONSTRUCTION_COSTS)
    return pascal;
  return trimmed;
}

interface GeoPoint { lat: number; lon: number }

function safeParseFootprint(json: string): GeoPoint[] | null {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.length >= 3)
      return parsed;
  }
  catch {
    // ignore
  }
  return null;
}

function segmentsIntersect(p1: GeoPoint, p2: GeoPoint, p3: GeoPoint, p4: GeoPoint): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function cross(a: GeoPoint, b: GeoPoint, c: GeoPoint): number {
  return (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon);
}

function pointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    if ((pi.lat > point.lat) !== (pj.lat > point.lat)
      && point.lon < ((pj.lon - pi.lon) * (point.lat - pi.lat)) / (pj.lat - pi.lat) + pi.lon) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonsIntersect(a: GeoPoint[], b: GeoPoint[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]!;
    const a2 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j]!;
      const b2 = b[(j + 1) % b.length]!;
      if (segmentsIntersect(a1, a2, b1, b2))
        return true;
    }
  }
  for (const p of a) {
    if (pointInPolygon(p, b))
      return true;
  }
  for (const p of b) {
    if (pointInPolygon(p, a))
      return true;
  }
  return false;
}

const BASE_FACILITY_AREA_KM2 = 1;

function footprintAreaKm2(footprint: GeoPoint[]): number {
  if (footprint.length < 3)
    return 0;
  let areaDeg2 = 0;
  for (let i = 0; i < footprint.length; i++) {
    const p1 = footprint[i]!;
    const p2 = footprint[(i + 1) % footprint.length]!;
    areaDeg2 += (p1.lon * p2.lat - p2.lon * p1.lat);
  }
  areaDeg2 = Math.abs(areaDeg2) / 2;
  const avgLat = footprint.reduce((s, p) => s + p.lat, 0) / footprint.length;
  const kmPerDegLat = 111;
  const kmPerDegLon = 111 * Math.cos(avgLat * Math.PI / 180);
  return areaDeg2 * kmPerDegLat * kmPerDegLon;
}

function mapToSummary(facility: FacilityRow): FacilitySummary {
  return {
    id: facility.id,
    type: facility.type as FacilitySummary['type'],
    name: facility.name,
    lat: facility.lat,
    lon: facility.lon,
    status: facility.status as FacilityStatus,
    techRequired: facility.techRequired,
    activeRecipeId: facility.activeRecipeId,
    powerConnected: Boolean(facility.powerConnected),
    throughput: facility.throughput,
    footprint: facility.footprint ? safeParseFootprint(facility.footprint) : null,
  };
}

export class FacilityService {
  constructor(
    private readonly facilityRepo: IFacilityRepository,
  ) {}

  buildFacility(params: {
    type: string;
    name: string;
    lat: number;
    lon: number;
    footprint?: Array<{ lat: number; lon: number }>;
  }): { facilityId: number; status: string } {
    const tick = this.facilityRepo.getTick();
    const facilityType = normalizeFacilityType(params.type);

    const requiredTech = FACILITY_TECH_REQUIREMENTS[facilityType];
    if (requiredTech) {
      const completedTech = this.facilityRepo.getCompletedTechIds();
      if (!completedTech.includes(requiredTech)) {
        throw new Error(`Facility type ${facilityType} requires tech "${requiredTech}" to be researched`);
      }
    }

    const isPowerGenerating = POWER_GENERATING_TYPES.has(facilityType);

    if (!params.footprint || params.footprint.length < 3) {
      throw new Error('Footprint is required: provide at least 3 {lat, lon} points forming a polygon');
    }

    const existingFacilities = this.facilityRepo.getAllFacilities();
    for (const existing of existingFacilities) {
      if (!existing.footprint)
        continue;
      const existingFootprint = safeParseFootprint(existing.footprint);
      if (!existingFootprint || existingFootprint.length < 3)
        continue;
      if (polygonsIntersect(params.footprint, existingFootprint)) {
        throw new Error(`Facility footprint overlaps existing facility "${existing.name}" (id: ${existing.id})`);
      }
    }

    this.checkAndConsumeConstructionCosts(facilityType, params.footprint);

    const footprint = JSON.stringify(params.footprint);

    const facility = this.facilityRepo.insertFacility({
      type: facilityType,
      name: params.name,
      lat: params.lat,
      lon: params.lon,
      footprint,
      status: FacilityStatus.UnderConstruction,
      techRequired: requiredTech ?? null,
      powerConnected: isPowerGenerating ? 1 : 0,
      createdAtTick: tick,
    });

    return { facilityId: facility.id, status: facility.status };
  }

  private checkAndConsumeConstructionCosts(type: string, footprint: GeoPoint[]): void {
    const costs = CONSTRUCTION_COSTS[type];
    if (!costs || costs.length === 0)
      return;

    const areaKm2 = Math.max(footprintAreaKm2(footprint), 0.01);
    const scale = areaKm2 / BASE_FACILITY_AREA_KM2;

    for (const cost of costs) {
      const needed = cost.quantity * scale;
      const stockpile = this.facilityRepo.getStockpile(cost.resourceKey);
      if (!stockpile || stockpile.quantity < needed) {
        const have = stockpile?.quantity ?? 0;
        throw new Error(`Insufficient resources to build ${type}: need ${needed.toFixed(1)}${cost.unit} ${cost.resourceKey} (footprint ${areaKm2.toFixed(2)} km² × ${cost.quantity}${cost.unit}), have ${have}${cost.unit}`);
      }
    }

    for (const cost of costs) {
      const needed = cost.quantity * scale;
      const stockpile = this.facilityRepo.getStockpile(cost.resourceKey);
      this.facilityRepo.decrementStockpile(stockpile!.id, stockpile!.quantity - needed);
    }
  }

  demolishFacility(facilityId: number): { success: boolean } {
    this.facilityRepo.deleteFacility(facilityId);
    this.facilityRepo.deleteFacilityBuffers(facilityId);
    return { success: true };
  }

  listFacilities(params: PaginationParams = {}): PaginatedResult<FacilitySummary> {
    const limit = Math.min(params.limit || 50, 200);
    const offset = Math.max(params.offset || 0, 0);

    const { items, totalCount } = this.facilityRepo.listFacilities(limit, offset);

    return {
      items: items.map(mapToSummary),
      totalCount,
      limit,
      offset,
      hasMore: offset + items.length < totalCount,
    };
  }

  getFacilityDetails(facilityId: number): FacilityDetail | null {
    const facility = this.facilityRepo.getFacilityById(facilityId);
    if (!facility)
      return null;

    const buffers = this.facilityRepo.getFacilityBuffers(facilityId);

    const inputs: FacilityBufferEntry[] = [];
    const outputs: FacilityBufferEntry[] = [];

    for (const buffer of buffers) {
      const entry: FacilityBufferEntry = {
        resourceKey: buffer.resourceKey,
        quantity: buffer.quantity,
        capacity: buffer.capacity,
        unit: buffer.unit,
      };
      if (buffer.direction === 'input') {
        inputs.push(entry);
      }
      else {
        outputs.push(entry);
      }
    }

    return {
      id: facility.id,
      type: facility.type as FacilitySummary['type'],
      name: facility.name,
      lat: facility.lat,
      lon: facility.lon,
      status: facility.status as FacilityStatus,
      techRequired: facility.techRequired,
      activeRecipeId: facility.activeRecipeId,
      targetOutputRate: facility.targetOutputRate,
      inputs,
      outputs,
      powerConsumption: facility.powerConsumption,
      powerConnected: Boolean(facility.powerConnected),
      elevation: facility.elevation,
      terrainClass: facility.terrainClass,
      constructionProgress: facility.constructionProgress,
      throughput: facility.targetOutputRate,
      footprint: facility.footprint ? safeParseFootprint(facility.footprint) : null,
    };
  }

  setProductionTarget(facilityId: number, recipeId: string, targetRate: number): { success: boolean } {
    const facility = this.facilityRepo.getFacilityById(facilityId);
    if (!facility) {
      throw new Error(`Facility not found: ${facilityId}`);
    }

    const recipe = this.facilityRepo.getRecipe(recipeId);
    if (!recipe) {
      throw new Error(`Recipe not found: ${recipeId}`);
    }
    if (recipe.facilityType !== facility.type) {
      throw new Error(`Recipe ${recipeId} requires a ${recipe.facilityType}, but facility ${facilityId} is a ${facility.type}`);
    }

    if (recipe.techRequired) {
      const completedTech = this.facilityRepo.getCompletedTechIds();
      if (!completedTech.includes(recipe.techRequired)) {
        throw new Error(`Recipe ${recipeId} requires tech "${recipe.techRequired}" to be researched`);
      }
    }

    this.facilityRepo.updateProductionTarget(facilityId, recipeId, targetRate);
    return { success: true };
  }

  searchFacilities(params: SearchFacilitiesParams): PaginatedResult<FacilitySummary> {
    const limit = Math.min(params.limit || 50, 200);
    const offset = Math.max(params.offset || 0, 0);

    const { items, totalCount } = this.facilityRepo.searchFacilities({ ...params, limit, offset });

    let filteredItems = items;
    if (params.nearLat !== undefined && params.nearLon !== undefined) {
      const radiusKm = params.radiusKm || 100;
      filteredItems = items.filter((f) => {
        const dist = greatCircleDistance(params.nearLat!, params.nearLon!, f.lat, f.lon);
        return dist <= radiusKm;
      });
    }

    return {
      items: filteredItems.map(mapToSummary),
      totalCount,
      limit,
      offset,
      hasMore: offset + filteredItems.length < totalCount,
    };
  }
}
