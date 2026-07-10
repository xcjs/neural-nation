import type { FacilityBufferEntry, FacilityDetail, FacilitySummary } from '../../../lib/types/facility'
import type { PaginatedResult, PaginationParams } from '../../../lib/types/mcp'
import { and, eq, sql } from 'drizzle-orm'
import { FacilityStatus } from '../../../lib/types/facility'
import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { greatCircleDistance } from '../../shared/geo/distance'

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
])

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
}

interface ConstructionCost {
  resourceKey: string
  quantity: number
  unit: string
}

const CONSTRUCTION_COSTS: Record<string, ConstructionCost[]> = {
  Extractor: [{ resourceKey: 'Steel', quantity: 2, unit: 't' }, { resourceKey: 'Concrete', quantity: 3, unit: 't' }],
  Farm: [{ resourceKey: 'Steel', quantity: 1, unit: 't' }, { resourceKey: 'Concrete', quantity: 2, unit: 't' }],
  Forestry: [{ resourceKey: 'Steel', quantity: 1, unit: 't' }, { resourceKey: 'Concrete', quantity: 1, unit: 't' }],
  WaterPump: [{ resourceKey: 'Steel', quantity: 1, unit: 't' }, { resourceKey: 'Concrete', quantity: 2, unit: 't' }],
  Processor: [{ resourceKey: 'Steel', quantity: 3, unit: 't' }, { resourceKey: 'Concrete', quantity: 5, unit: 't' }],
  Smelter: [{ resourceKey: 'Steel', quantity: 3, unit: 't' }, { resourceKey: 'Concrete', quantity: 5, unit: 't' }],
  Refinery: [{ resourceKey: 'Steel', quantity: 4, unit: 't' }, { resourceKey: 'Concrete', quantity: 5, unit: 't' }],
  Factory: [{ resourceKey: 'Steel', quantity: 5, unit: 't' }, { resourceKey: 'Concrete', quantity: 8, unit: 't' }, { resourceKey: 'Machinery', quantity: 1, unit: 't' }],
  AdvancedFactory: [{ resourceKey: 'Steel', quantity: 8, unit: 't' }, { resourceKey: 'Concrete', quantity: 10, unit: 't' }, { resourceKey: 'Machinery', quantity: 2, unit: 't' }, { resourceKey: 'Electronics', quantity: 1, unit: 't' }],
  ChemicalPlant: [{ resourceKey: 'Steel', quantity: 4, unit: 't' }, { resourceKey: 'Concrete', quantity: 6, unit: 't' }, { resourceKey: 'Machinery', quantity: 1, unit: 't' }],
  ResearchLab: [{ resourceKey: 'Steel', quantity: 5, unit: 't' }, { resourceKey: 'Concrete', quantity: 8, unit: 't' }, { resourceKey: 'Machinery', quantity: 2, unit: 't' }],
  PowerPlant: [{ resourceKey: 'Steel', quantity: 5, unit: 't' }, { resourceKey: 'Concrete', quantity: 10, unit: 't' }, { resourceKey: 'Machinery', quantity: 2, unit: 't' }],
  SolarFarm: [{ resourceKey: 'Steel', quantity: 2, unit: 't' }, { resourceKey: 'Concrete', quantity: 3, unit: 't' }],
  WindFarm: [{ resourceKey: 'Steel', quantity: 3, unit: 't' }, { resourceKey: 'Concrete', quantity: 4, unit: 't' }],
  HydroPlant: [{ resourceKey: 'Steel', quantity: 8, unit: 't' }, { resourceKey: 'Concrete', quantity: 15, unit: 't' }, { resourceKey: 'Machinery', quantity: 3, unit: 't' }],
  NuclearReactor: [{ resourceKey: 'Steel', quantity: 10, unit: 't' }, { resourceKey: 'Concrete', quantity: 20, unit: 't' }, { resourceKey: 'Machinery', quantity: 3, unit: 't' }, { resourceKey: 'Electronics', quantity: 2, unit: 't' }],
  BreederReactor: [{ resourceKey: 'Steel', quantity: 12, unit: 't' }, { resourceKey: 'Concrete', quantity: 25, unit: 't' }, { resourceKey: 'Machinery', quantity: 4, unit: 't' }, { resourceKey: 'Electronics', quantity: 3, unit: 't' }],
  FusionReactor: [{ resourceKey: 'Steel', quantity: 20, unit: 't' }, { resourceKey: 'Concrete', quantity: 30, unit: 't' }, { resourceKey: 'Machinery', quantity: 5, unit: 't' }, { resourceKey: 'Electronics', quantity: 5, unit: 't' }, { resourceKey: 'Alloys', quantity: 2, unit: 't' }],
  BiomassPlant: [{ resourceKey: 'Steel', quantity: 3, unit: 't' }, { resourceKey: 'Concrete', quantity: 4, unit: 't' }],
  BiogasPlant: [{ resourceKey: 'Steel', quantity: 3, unit: 't' }, { resourceKey: 'Concrete', quantity: 4, unit: 't' }],
  EthanolRefinery: [{ resourceKey: 'Steel', quantity: 4, unit: 't' }, { resourceKey: 'Concrete', quantity: 6, unit: 't' }, { resourceKey: 'Machinery', quantity: 1, unit: 't' }],
  SoylentPlant: [{ resourceKey: 'Steel', quantity: 4, unit: 't' }, { resourceKey: 'Concrete', quantity: 6, unit: 't' }, { resourceKey: 'Machinery', quantity: 1, unit: 't' }],
  DieselGenerator: [{ resourceKey: 'Steel', quantity: 2, unit: 't' }, { resourceKey: 'Machinery', quantity: 1, unit: 't' }],
  CoalPlant: [{ resourceKey: 'Steel', quantity: 5, unit: 't' }, { resourceKey: 'Concrete', quantity: 8, unit: 't' }, { resourceKey: 'Machinery', quantity: 2, unit: 't' }],
  GasPlant: [{ resourceKey: 'Steel', quantity: 4, unit: 't' }, { resourceKey: 'Concrete', quantity: 6, unit: 't' }, { resourceKey: 'Machinery', quantity: 2, unit: 't' }],
  OilPlant: [{ resourceKey: 'Steel', quantity: 4, unit: 't' }, { resourceKey: 'Concrete', quantity: 6, unit: 't' }, { resourceKey: 'Machinery', quantity: 2, unit: 't' }],
  GeothermalPlant: [{ resourceKey: 'Steel', quantity: 6, unit: 't' }, { resourceKey: 'Concrete', quantity: 10, unit: 't' }, { resourceKey: 'Machinery', quantity: 2, unit: 't' }],
  Storage: [{ resourceKey: 'Steel', quantity: 2, unit: 't' }, { resourceKey: 'Concrete', quantity: 4, unit: 't' }],
  BatteryBank: [{ resourceKey: 'Steel', quantity: 3, unit: 't' }, { resourceKey: 'Electronics', quantity: 1, unit: 't' }],
  Spaceport: [{ resourceKey: 'Steel', quantity: 15, unit: 't' }, { resourceKey: 'Concrete', quantity: 20, unit: 't' }, { resourceKey: 'Machinery', quantity: 5, unit: 't' }, { resourceKey: 'Electronics', quantity: 3, unit: 't' }, { resourceKey: 'Fuel', quantity: 10, unit: 't' }],
  RocketAssembly: [{ resourceKey: 'Steel', quantity: 10, unit: 't' }, { resourceKey: 'Machinery', quantity: 3, unit: 't' }, { resourceKey: 'Electronics', quantity: 2, unit: 't' }, { resourceKey: 'Fuel', quantity: 5, unit: 't' }],
  SpaceStation: [{ resourceKey: 'Steel', quantity: 20, unit: 't' }, { resourceKey: 'Alloys', quantity: 5, unit: 't' }, { resourceKey: 'Electronics', quantity: 5, unit: 't' }, { resourceKey: 'Composites', quantity: 3, unit: 't' }],
  OrbitalRefinery: [{ resourceKey: 'Steel', quantity: 15, unit: 't' }, { resourceKey: 'Machinery', quantity: 3, unit: 't' }, { resourceKey: 'Electronics', quantity: 3, unit: 't' }],
  LunarMine: [{ resourceKey: 'Steel', quantity: 12, unit: 't' }, { resourceKey: 'Machinery', quantity: 3, unit: 't' }, { resourceKey: 'Composites', quantity: 2, unit: 't' }],
  DeepSpaceProbe: [{ resourceKey: 'Steel', quantity: 8, unit: 't' }, { resourceKey: 'Electronics', quantity: 4, unit: 't' }, { resourceKey: 'Composites', quantity: 2, unit: 't' }],
  SpaceHabitat: [{ resourceKey: 'Steel', quantity: 25, unit: 't' }, { resourceKey: 'Alloys', quantity: 8, unit: 't' }, { resourceKey: 'Composites', quantity: 5, unit: 't' }, { resourceKey: 'Electronics', quantity: 5, unit: 't' }],
  Excavator: [{ resourceKey: 'Steel', quantity: 5, unit: 't' }, { resourceKey: 'Machinery', quantity: 2, unit: 't' }],
  Dredger: [{ resourceKey: 'Steel', quantity: 5, unit: 't' }, { resourceKey: 'Machinery', quantity: 2, unit: 't' }],
  Terraformer: [{ resourceKey: 'Steel', quantity: 10, unit: 't' }, { resourceKey: 'Machinery', quantity: 5, unit: 't' }, { resourceKey: 'Electronics', quantity: 3, unit: 't' }, { resourceKey: 'Alloys', quantity: 2, unit: 't' }],
  PlanetaryEngine: [{ resourceKey: 'Steel', quantity: 30, unit: 't' }, { resourceKey: 'Concrete', quantity: 50, unit: 't' }, { resourceKey: 'Machinery', quantity: 10, unit: 't' }, { resourceKey: 'Electronics', quantity: 5, unit: 't' }, { resourceKey: 'Alloys', quantity: 5, unit: 't' }, { resourceKey: 'Composites', quantity: 3, unit: 't' }],
}

function checkAndConsumeConstructionCosts(
  db: ReturnType<typeof createGameDb>,
  type: string,
): void {
  const costs = CONSTRUCTION_COSTS[type]
  if (!costs || costs.length === 0)
    return

  for (const cost of costs) {
    const stockpile = db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, cost.resourceKey)).get()

    if (!stockpile || stockpile.quantity < cost.quantity) {
      const have = stockpile?.quantity ?? 0
      throw new Error(`Insufficient resources to build ${type}: need ${cost.quantity}${cost.unit} ${cost.resourceKey}, have ${have}${cost.unit}`)
    }
  }

  for (const cost of costs) {
    const stockpile = db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, cost.resourceKey)).get()
    db.update(schema.stockpiles)
      .set({ quantity: stockpile!.quantity - cost.quantity })
      .where(eq(schema.stockpiles.id, stockpile!.id))
      .run()
  }
}

interface GeoPoint { lat: number, lon: number }

function safeParseFootprint(json: string): GeoPoint[] | null {
  try {
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed) && parsed.length >= 3)
      return parsed
  }
  catch {
    // ignore
  }
  return null
}

function segmentsIntersect(p1: GeoPoint, p2: GeoPoint, p3: GeoPoint, p4: GeoPoint): boolean {
  const d1 = cross(p3, p4, p1)
  const d2 = cross(p3, p4, p2)
  const d3 = cross(p1, p2, p3)
  const d4 = cross(p1, p2, p4)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  return false
}

function cross(a: GeoPoint, b: GeoPoint, c: GeoPoint): number {
  return (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon)
}

function pointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!
    const pj = polygon[j]!
    if ((pi.lat > point.lat) !== (pj.lat > point.lat)
      && point.lon < ((pj.lon - pi.lon) * (point.lat - pi.lat)) / (pj.lat - pi.lat) + pi.lon) {
      inside = !inside
    }
  }
  return inside
}

function polygonsIntersect(a: GeoPoint[], b: GeoPoint[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]!
    const a2 = a[(i + 1) % a.length]!
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j]!
      const b2 = b[(j + 1) % b.length]!
      if (segmentsIntersect(a1, a2, b1, b2))
        return true
    }
  }
  for (const p of a) {
    if (pointInPolygon(p, b))
      return true
  }
  for (const p of b) {
    if (pointInPolygon(p, a))
      return true
  }
  return false
}

export function buildFacility(
  token: string,
  params: {
    type: string
    name: string
    lat: number
    lon: number
    footprint?: Array<{ lat: number, lon: number }>
  },
): { facilityId: number, status: string } {
  const db = createGameDb(token)

  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()
  const tick = meta?.tickCount || 0

  // Tech prerequisite check: certain facility types require researched tech
  const requiredTech = FACILITY_TECH_REQUIREMENTS[params.type]
  if (requiredTech) {
    const completedTech = db.select().from(schema.gameResearch).where(eq(schema.gameResearch.status, 'Completed')).all().map(r => r.techId)
    if (!completedTech.includes(requiredTech)) {
      throw new Error(`Facility type ${params.type} requires tech "${requiredTech}" to be researched`)
    }
  }

  // Power-generating facilities are self-powered; others start disconnected
  // (the agent must build power lines to connect them — see ADR-0014)
  const isPowerGenerating = POWER_GENERATING_TYPES.has(params.type)

  // Footprint validation: required, minimum 3 points
  if (!params.footprint || params.footprint.length < 3) {
    throw new Error('Footprint is required: provide at least 3 {lat, lon} points forming a polygon')
  }

  // Check for overlap with existing facility footprints
  const existingFacilities = db.select().from(schema.facilities).all()
  for (const existing of existingFacilities) {
    if (!existing.footprint)
      continue
    let existingFootprint: GeoPoint[]
    try {
      existingFootprint = JSON.parse(existing.footprint)
    }
    catch {
      continue
    }
    if (existingFootprint.length < 3)
      continue
    if (polygonsIntersect(params.footprint, existingFootprint)) {
      throw new Error(`Facility footprint overlaps existing facility "${existing.name}" (id: ${existing.id})`)
    }
  }

  // Construction resource consumption (ADR-0007/0018)
  checkAndConsumeConstructionCosts(db, params.type)

  const footprint = JSON.stringify(params.footprint)

  const facility = db.insert(schema.facilities).values({
    type: params.type,
    name: params.name,
    lat: params.lat,
    lon: params.lon,
    status: FacilityStatus.UnderConstruction,
    techRequired: requiredTech ?? null,
    activeRecipeId: null,
    targetOutputRate: 0,
    powerConsumption: 0,
    powerConnected: isPowerGenerating ? 1 : 0,
    throughput: 0,
    constructionProgress: 0,
    elevation: 0,
    terrainClass: 'Plain',
    footprint,
    createdAtTick: tick,
  }).returning().get()

  return { facilityId: facility.id, status: facility.status }
}

export function demolishFacility(token: string, facilityId: number): { success: boolean } {
  const db = createGameDb(token)

  db.delete(schema.facilities).where(eq(schema.facilities.id, facilityId)).run()
  db.delete(schema.facilityBuffers).where(eq(schema.facilityBuffers.facilityId, facilityId)).run()

  return { success: true }
}

export function listFacilities(
  token: string,
  params: PaginationParams = {},
): PaginatedResult<FacilitySummary> {
  const db = createGameDb(token)
  const limit = Math.min(params.limit || 50, 200)
  const offset = Math.max(params.offset || 0, 0)

  const items = db.select().from(schema.facilities).limit(limit).offset(offset).all()

  const totalCount = db.select({ count: sql<number>`count(*)` })
    .from(schema.facilities)
    .get()
    ?.count || 0

  return {
    items: items.map(mapToSummary),
    totalCount,
    limit,
    offset,
    hasMore: offset + items.length < totalCount,
  }
}

export function getFacilityDetails(token: string, facilityId: number): FacilityDetail | null {
  const db = createGameDb(token)

  const facility = db.select().from(schema.facilities).where(eq(schema.facilities.id, facilityId)).get()

  if (!facility)
    return null

  const buffers = db.select().from(schema.facilityBuffers).where(eq(schema.facilityBuffers.facilityId, facilityId)).all()

  const inputs: FacilityBufferEntry[] = []
  const outputs: FacilityBufferEntry[] = []

  for (const buffer of buffers) {
    const entry: FacilityBufferEntry = {
      resourceKey: buffer.resourceKey,
      quantity: buffer.quantity,
      capacity: buffer.capacity,
      unit: buffer.unit,
    }
    if (buffer.direction === 'input') {
      inputs.push(entry)
    }
    else {
      outputs.push(entry)
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
  }
}

export function setProductionTarget(
  token: string,
  facilityId: number,
  recipeId: string,
  targetRate: number,
): { success: boolean } {
  const db = createGameDb(token)

  // Validate facility exists
  const facility = db.select().from(schema.facilities).where(eq(schema.facilities.id, facilityId)).get()
  if (!facility) {
    throw new Error(`Facility not found: ${facilityId}`)
  }

  // Validate recipe exists and matches facility type
  const recipe = db.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId)).get()
  if (!recipe) {
    throw new Error(`Recipe not found: ${recipeId}`)
  }
  if (recipe.facilityType !== facility.type) {
    throw new Error(`Recipe ${recipeId} requires a ${recipe.facilityType}, but facility ${facilityId} is a ${facility.type}`)
  }

  // Check recipe tech prerequisite is researched
  if (recipe.techRequired) {
    const completedTech = db.select().from(schema.gameResearch).where(eq(schema.gameResearch.status, 'Completed')).all().map(r => r.techId)
    if (!completedTech.includes(recipe.techRequired)) {
      throw new Error(`Recipe ${recipeId} requires tech "${recipe.techRequired}" to be researched`)
    }
  }

  db.update(schema.facilities)
    .set({
      activeRecipeId: recipeId,
      targetOutputRate: targetRate,
    })
    .where(eq(schema.facilities.id, facilityId))
    .run()

  return { success: true }
}

export function searchFacilities(
  token: string,
  params: {
    type?: string
    status?: string
    producesResource?: string
    consumesResource?: string
    nearLat?: number
    nearLon?: number
    radiusKm?: number
    limit?: number
    offset?: number
  },
): PaginatedResult<FacilitySummary> {
  const db = createGameDb(token)
  const limit = Math.min(params.limit || 50, 200)
  const offset = Math.max(params.offset || 0, 0)

  let queryBuilder = db.select().from(schema.facilities).$dynamic()
  const conditions = []

  if (params.type) {
    conditions.push(eq(schema.facilities.type, params.type))
  }

  if (params.status) {
    conditions.push(eq(schema.facilities.status, params.status))
  }

  if (params.producesResource) {
    // Facilities with an output buffer for this resource
    const facilityIds = db.select().from(schema.facilityBuffers).where(
      and(
        eq(schema.facilityBuffers.resourceKey, params.producesResource),
        eq(schema.facilityBuffers.direction, 'output'),
      ),
    ).all().map(b => b.facilityId)
    if (facilityIds.length > 0) {
      conditions.push(sql`${schema.facilities.id} IN (${sql.join(facilityIds.map(id => sql`${id}`), sql`,`)})`)
    }
    else {
      conditions.push(sql`1=0`)
    }
  }

  if (params.consumesResource) {
    // Facilities with an input buffer for this resource
    const facilityIds = db.select().from(schema.facilityBuffers).where(
      and(
        eq(schema.facilityBuffers.resourceKey, params.consumesResource),
        eq(schema.facilityBuffers.direction, 'input'),
      ),
    ).all().map(b => b.facilityId)
    if (facilityIds.length > 0) {
      conditions.push(sql`${schema.facilities.id} IN (${sql.join(facilityIds.map(id => sql`${id}`), sql`,`)})`)
    }
    else {
      conditions.push(sql`1=0`)
    }
  }

  if (conditions.length > 0) {
    queryBuilder = queryBuilder.where(and(...conditions))
  }

  let items = queryBuilder.limit(limit).offset(offset).all()

  // Proximity filter (post-query since it requires haversine math)
  if (params.nearLat !== undefined && params.nearLon !== undefined) {
    const radiusKm = params.radiusKm || 100
    items = items.filter((f) => {
      const dist = greatCircleDistance(params.nearLat!, params.nearLon!, f.lat, f.lon)
      return dist <= radiusKm
    })
  }

  const countQuery = db.select({ count: sql<number>`count(*)` })
    .from(schema.facilities)
    .$dynamic()
  if (conditions.length > 0) {
    countQuery.where(and(...conditions))
  }
  const totalCount = countQuery.get()?.count || 0

  return {
    items: items.map(mapToSummary),
    totalCount,
    limit,
    offset,
    hasMore: offset + items.length < totalCount,
  }
}

function mapToSummary(facility: typeof schema.facilities.$inferSelect): FacilitySummary {
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
  }
}
