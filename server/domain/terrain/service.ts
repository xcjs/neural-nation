import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { TerrainCell, TerrainModification } from '../../../lib/types/terrain'
import { TerraformAction, TerrainClass } from '../../../lib/types/terrain'
import type { PaginationParams, PaginatedResult } from '../../../lib/types/mcp'

export function getEffectiveTerrain(token: string, lat: number, lon: number) {
  const db = createGameDb(token)

  const baseCell = db.select().from(schema.terrain)
    .where(
      and(
        sql`abs(${schema.terrain.lat} - ${lat}) <= 0.05`,
        sql`abs(${schema.terrain.lon} - ${lon}) <= 0.05`,
      ),
    )
    .get()

  if (!baseCell) return null

  const mods = db.select().from(schema.terrainModifications)
    .where(
      and(
        eq(schema.terrainModifications.latIndex, baseCell.latIndex),
        eq(schema.terrainModifications.lonIndex, baseCell.lonIndex),
      ),
    )
    .all()

  const elevationDelta = mods.reduce((sum, m) => sum + m.elevationDelta, 0)
  const effectiveElevation = baseCell.elevation + elevationDelta

  let effectiveClass = baseCell.terrainClass
  const lastClassMod = mods.findLast((m) => m.newTerrainClass !== null)
  if (lastClassMod?.newTerrainClass) {
    effectiveClass = lastClassMod.newTerrainClass
  } else {
    effectiveClass = classifyByElevation(effectiveElevation)
  }

  return {
    lat: baseCell.lat,
    lon: baseCell.lon,
    baseElevation: baseCell.elevation,
    effectiveElevation,
    baseTerrainClass: baseCell.terrainClass,
    effectiveTerrainClass: effectiveClass,
    modifications: mods,
  }
}

export function getTerrainPath(
  token: string,
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): { cells: TerrainCell[]; modifiers: string[]; distance: number } {
  const db = createGameDb(token)

  const latMin = Math.min(fromLat, toLat)
  const latMax = Math.max(fromLat, toLat)
  const lonMin = Math.min(fromLon, toLon)
  const lonMax = Math.max(fromLon, toLon)

  const cells = db.select().from(schema.terrain)
    .where(
      and(
        sql`${schema.terrain.lat} >= ${latMin} AND ${schema.terrain.lat} <= ${latMax}`,
        sql`${schema.terrain.lon} >= ${lonMin} AND ${schema.terrain.lon} <= ${lonMax}`,
      ),
    )
    .all()

  const modifiers: string[] = []

  for (const cell of cells) {
    const effective = getEffectiveTerrain(token, cell.lat, cell.lon)
    const terrainClass = effective?.effectiveTerrainClass || cell.terrainClass

    if (terrainClass === 'Mountain' || terrainClass === 'HighMountain') {
      if (!modifiers.includes('tunnel')) modifiers.push('tunnel')
    }
    if (terrainClass === 'Ocean') {
      if (!modifiers.includes('bridge')) modifiers.push('bridge')
    }
  }

  const distance = Math.sqrt(
    Math.pow(toLat - fromLat, 2) + Math.pow(toLon - fromLon, 2),
  ) * 111

  return { cells, modifiers, distance }
}

export function terraform(
  token: string,
  action: TerraformAction,
  params: {
    facilityId: number
    targetCells: Array<{ latIndex: number; lonIndex: number }>
  },
): { modificationsApplied: number; operationId: string } {
  const db = createGameDb(token)

  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()
  const tick = meta?.tickCount || 0

  const operationId = `terraform-${tick}-${params.facilityId}`
  let modificationsApplied = 0

  for (const target of params.targetCells) {
    const { elevationDelta, newTerrainClass } = getTerraformEffect(action)

    db.insert(schema.terrainModifications).values({
      latIndex: target.latIndex,
      lonIndex: target.lonIndex,
      elevationDelta,
      newTerrainClass,
      modifiedBy: params.facilityId,
      modifiedAtTick: tick,
      operationId,
      reason: action,
    }).run()

    modificationsApplied++
  }

  return { modificationsApplied, operationId }
}

export function getTerrainModifications(
  token: string,
  params: PaginationParams = {},
): PaginatedResult<TerrainModification> {
  const db = createGameDb(token)
  const limit = params.limit || 50
  const offset = params.offset || 0

  const items = db.select().from(schema.terrainModifications)
    .limit(limit)
    .offset(offset)
    .all()

  const totalCount = db.select({ count: sql<number>`count(*)` })
    .from(schema.terrainModifications)
    .get()?.count || 0

  return {
    items: items as unknown as TerrainModification[],
    totalCount,
    limit,
    offset,
    hasMore: offset + items.length < totalCount,
  }
}

export function getTerraformCostEstimate(
  token: string,
  action: TerraformAction,
  _params: { targetCells: Array<{ latIndex: number; lonIndex: number }> },
): { costs: Array<{ resourceKey: string; quantity: number; unit: string }>; environmentalImpact: string; estimatedIncidents: string[] } {
  const { costs, environmentalImpact, estimatedIncidents } = getTerraformDefaults(action)
  return { costs, environmentalImpact, estimatedIncidents }
}

function getTerraformEffect(action: TerraformAction): { elevationDelta: number; newTerrainClass: string | null } {
  switch (action) {
    case TerraformAction.FlattenTerrain:
      return { elevationDelta: -50, newTerrainClass: 'Plain' }
    case TerraformAction.DigCanal:
      return { elevationDelta: -100, newTerrainClass: 'Ocean' }
    case TerraformAction.BuildRoadEmbankment:
      return { elevationDelta: 20, newTerrainClass: 'Plain' }
    case TerraformAction.CreateReservoir:
      return { elevationDelta: -30, newTerrainClass: 'Ocean' }
    case TerraformAction.DrainArea:
      return { elevationDelta: 30, newTerrainClass: 'Plain' }
    case TerraformAction.DivertRiver:
      return { elevationDelta: -20, newTerrainClass: 'Ocean' }
    case TerraformAction.LevelMountain:
      return { elevationDelta: -1000, newTerrainClass: 'Plain' }
    case TerraformAction.RaiseLand:
      return { elevationDelta: 100, newTerrainClass: 'Plain' }
    case TerraformAction.ExcavateMineShaft:
      return { elevationDelta: -200, newTerrainClass: null }
    case TerraformAction.CreateMountain:
      return { elevationDelta: 1000, newTerrainClass: 'Mountain' }
    case TerraformAction.ShiftContinentalPlate:
      return { elevationDelta: 500, newTerrainClass: null }
    case TerraformAction.OceanToLand:
      return { elevationDelta: 200, newTerrainClass: 'Coastal' }
    case TerraformAction.LandToOcean:
      return { elevationDelta: -200, newTerrainClass: 'Ocean' }
    default:
      return { elevationDelta: 0, newTerrainClass: null }
  }
}

function getTerraformDefaults(action: TerraformAction): {
  costs: Array<{ resourceKey: string; quantity: number; unit: string }>
  environmentalImpact: string
  estimatedIncidents: string[]
} {
  switch (action) {
    case TerraformAction.FlattenTerrain:
      return {
        costs: [{ resourceKey: 'Fuel', quantity: 5, unit: 't' }, { resourceKey: 'Machinery', quantity: 2, unit: 't' }],
        environmentalImpact: 'Low - minor surface disruption',
        estimatedIncidents: [],
      }
    case TerraformAction.LevelMountain:
      return {
        costs: [{ resourceKey: 'Machinery', quantity: 50, unit: 't' }, { resourceKey: 'Explosives', quantity: 20, unit: 't' }, { resourceKey: 'Fuel', quantity: 100, unit: 't' }],
        environmentalImpact: 'Extreme - total ecosystem destruction in target area',
        estimatedIncidents: ['ecological_collapse', 'climate_shift'],
      }
    case TerraformAction.ShiftContinentalPlate:
      return {
        costs: [{ resourceKey: 'Machinery', quantity: 500, unit: 't' }, { resourceKey: 'Fuel', quantity: 1000, unit: 't' }, { resourceKey: 'FusionCore', quantity: 5, unit: 't' }],
        environmentalImpact: 'Catastrophic - global-scale environmental disruption',
        estimatedIncidents: ['ecological_collapse', 'climate_shift', 'water_contamination'],
      }
    default:
      return {
        costs: [{ resourceKey: 'Machinery', quantity: 10, unit: 't' }, { resourceKey: 'Fuel', quantity: 20, unit: 't' }],
        environmentalImpact: 'Moderate',
        estimatedIncidents: [],
      }
  }
}

function classifyByElevation(elevation: number): string {
  if (elevation \u003c 0) return 'Ocean'
  if (elevation \u003c 200) return 'Coastal'
  if (elevation \u003c 800) return 'Plain'
  if (elevation \u003c 1500) return 'Hill'
  if (elevation \u003c 3000) return 'Mountain'
  return 'HighMountain'
}