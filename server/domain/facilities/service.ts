import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { FacilitySummary, FacilityDetail, FacilityBufferEntry } from '../../../lib/types/facility'
import { FacilityStatus } from '../../../lib/types/facility'
import type { PaginationParams, PaginatedResult } from '../../../lib/types/mcp'

const POWER_GENERATING_TYPES = new Set([
  'PowerPlant', 'SolarFarm', 'WindFarm', 'HydroPlant', 'NuclearReactor',
  'BreederReactor', 'FusionReactor', 'BiomassPlant', 'BiogasPlant',
  'DieselGenerator', 'CoalPlant', 'GasPlant', 'OilPlant', 'GeothermalPlant',
])

const FACILITY_TECH_REQUIREMENTS: Record<string, string> = {
  AdvancedFactory: 'precision_manufacturing',
  ResearchLab: 'precision_manufacturing',
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

export function buildFacility(
  token: string,
  params: {
    type: string
    name: string
    lat: number
    lon: number
  },
): { facilityId: number; status: string } {
  const db = createGameDb(token)

  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()
  const tick = meta?.tickCount || 0

  // Tech prerequisite check: certain facility types require researched tech
  const requiredTech = FACILITY_TECH_REQUIREMENTS[params.type]
  if (requiredTech) {
    const completedTech = db.select().from(schema.gameResearch)
      .where(eq(schema.gameResearch.status, 'Completed'))
      .all()
      .map((r) => r.techId)
    if (!completedTech.includes(requiredTech)) {
      throw new Error(`Facility type ${params.type} requires tech "${requiredTech}" to be researched`)
    }
  }

  // Power-generating facilities are self-powered; others start disconnected
  // (the agent must build power lines to connect them — see ADR-0014)
  const isPowerGenerating = POWER_GENERATING_TYPES.has(params.type)

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
  const limit = params.limit || 50
  const offset = params.offset || 0

  const items = db.select().from(schema.facilities).limit(limit).offset(offset).all()

  const totalCount = db.select({ count: sql<number>`count(*)` })
    .from(schema.facilities)
    .get()?.count || 0

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

  const facility = db.select().from(schema.facilities)
    .where(eq(schema.facilities.id, facilityId))
    .get()

  if (!facility) return null

  const buffers = db.select().from(schema.facilityBuffers)
    .where(eq(schema.facilityBuffers.facilityId, facilityId))
    .all()

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
    } else {
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
  const facility = db.select().from(schema.facilities)
    .where(eq(schema.facilities.id, facilityId))
    .get()
  if (!facility) {
    throw new Error(`Facility not found: ${facilityId}`)
  }

  // Validate recipe exists and matches facility type
  const recipe = db.select().from(schema.recipes)
    .where(eq(schema.recipes.id, recipeId))
    .get()
  if (!recipe) {
    throw new Error(`Recipe not found: ${recipeId}`)
  }
  if (recipe.facilityType !== facility.type) {
    throw new Error(`Recipe ${recipeId} requires a ${recipe.facilityType}, but facility ${facilityId} is a ${facility.type}`)
  }

  // Check recipe tech prerequisite is researched
  if (recipe.techRequired) {
    const completedTech = db.select().from(schema.gameResearch)
      .where(eq(schema.gameResearch.status, 'Completed'))
      .all()
      .map((r) => r.techId)
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
  const limit = params.limit || 50
  const offset = params.offset || 0

  let queryBuilder = db.select().from(schema.facilities).$dynamic()
  const conditions = []

  if (params.type) {
    conditions.push(eq(schema.facilities.type, params.type))
  }

  if (params.status) {
    conditions.push(eq(schema.facilities.status, params.status))
  }

  if (conditions.length > 0) {
    queryBuilder = queryBuilder.where(and(...conditions))
  }

  const items = queryBuilder.limit(limit).offset(offset).all()
  const totalCount = db.select({ count: sql<number>`count(*)` })
    .from(schema.facilities)
    .get()?.count || 0

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
  }
}