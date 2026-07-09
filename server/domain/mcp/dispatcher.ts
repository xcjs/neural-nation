import { processTick } from '../game/tick'
import { surveyRegion, getDiscoveredResources, getResourceOverview, getResourceDetails, getResourceStockpile, searchResources } from '../resources'
import { buildFacility, demolishFacility, listFacilities, getFacilityDetails, setProductionTarget, searchFacilities } from '../facilities'
import { buildTransport, demolishTransport, listTransports, assignRoute, getSupplyChainStatus } from '../transport'
import { getEffectiveTerrain, getTerrainPath, terraform, getTerrainModifications, getTerraformCostEstimate } from '../terrain'
import { getPowerGridStatus } from '../power'
import { getEnvironmentalStatus, getImpactForecast, getIncidents } from '../humanity'
import { getSpaceStatus, launchMission, assignSpaceCrew } from '../space'
import { getTechTree, getRecipes, startResearch, searchRecipes } from '../tech'
import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { publish, type GameEvent } from '../events/bus'
import { GameStatus } from '../../../lib/types/game'
import { updateLastActive } from '../game/service'
import { buildFullGameState } from '../game/state'
import type { TerraformAction } from '../../../lib/types/terrain'
import type { TransportType } from '../../../lib/types/transport'

export interface ToolCallResult {
  status: 'success' | 'warning' | 'error'
  data: unknown
  errorMessage?: string
}

const READ_ONLY_TOOLS = new Set([
  'get_game_state', 'get_event_log', 'list_facilities', 'get_facility_details',
  'get_discovered_resources', 'get_resource_overview', 'get_resource_details',
  'get_resource_stockpile', 'search_resources', 'search_facilities',
  'list_transports', 'get_supply_chain_status', 'get_terrain_path',
  'get_tech_tree', 'get_recipes', 'search_recipes', 'get_terrain_modifications',
  'get_effective_terrain', 'get_terraform_cost_estimate', 'get_power_grid_status',
  'get_environmental_status', 'get_impact_forecast', 'get_space_status',
])

export function executeTool(token: string, toolName: string, args: Record<string, unknown>): ToolCallResult {
  try {
    // Gate tools on game status
    const gameState = getGameState(token)
    if (gameState.status === GameStatus.GameOver) {
      return { status: 'error', data: null, errorMessage: 'Game is over' }
    }
    if (gameState.status === GameStatus.Paused && !READ_ONLY_TOOLS.has(toolName)) {
      return { status: 'error', data: null, errorMessage: 'Game is paused — only read-only tools allowed' }
    }

    const result = dispatchTool(token, toolName, args)

    processTick(token)

    updateLastActive(token)

    logAction(token, toolName, args, 'success', result)

    emitGameEvents(token, toolName, args, result)

    return { status: 'success', data: result }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logAction(token, toolName, args, 'error', null, errorMessage)
    return { status: 'error', data: null, errorMessage }
  }
}

function dispatchTool(token: string, toolName: string, args: Record<string, unknown>): unknown {
  switch (toolName) {
    // Resource tools
    case 'survey_region':
      return surveyRegion(token, args.lat as number, args.lon as number, args.radius as number)
    case 'get_discovered_resources':
      return getDiscoveredResources(token, { limit: args.limit as number, offset: args.offset as number })
    case 'get_resource_overview':
      return getResourceOverview(token)
    case 'get_resource_details':
      return getResourceDetails(token, args.resourceKey as string)
    case 'get_resource_stockpile':
      return getResourceStockpile(token, args.resourceKey as string | undefined)
    case 'search_resources':
      return searchResources(token, args as Parameters<typeof searchResources>[1])
    // Facility tools
    case 'build_facility':
      return buildFacility(token, { type: args.type as string, name: args.name as string, lat: args.lat as number, lon: args.lon as number })
    case 'demolish_facility':
      return demolishFacility(token, args.facilityId as number)
    case 'list_facilities':
      return listFacilities(token, { limit: args.limit as number, offset: args.offset as number })
    case 'get_facility_details':
      return getFacilityDetails(token, args.facilityId as number)
    case 'set_production_target':
      return setProductionTarget(token, args.facilityId as number, args.recipeId as string, args.targetRate as number)
    case 'search_facilities':
      return searchFacilities(token, args as Parameters<typeof searchFacilities>[1])
    // Transport tools
    case 'build_transport': {
      const transportParams: { type: TransportType; fromFacilityId: number; toFacilityId: number; resourceKey?: string } = {
        type: args.type as TransportType,
        fromFacilityId: args.fromFacilityId as number,
        toFacilityId: args.toFacilityId as number,
      }
      if (args.resourceKey) transportParams.resourceKey = args.resourceKey as string
      return buildTransport(token, transportParams)
    }
    case 'demolish_transport':
      return demolishTransport(token, args.transportId as number)
    case 'list_transports':
      return listTransports(token, { limit: args.limit as number, offset: args.offset as number })
    case 'assign_route':
      return assignRoute(token, args.transportId as number, args.resourceKey as string, args.flowRate as number)
    case 'get_supply_chain_status':
      return getSupplyChainStatus(token)
    case 'get_terrain_path':
      return getTerrainPath(token, args.fromLat as number, args.fromLon as number, args.toLat as number, args.toLon as number)
    // Tech tools
    case 'start_research':
      return startResearch(token, args.techNodeId as string, args.labFacilityId as number)
    case 'get_tech_tree':
      return getTechTree(token)
    case 'get_recipes':
      return getRecipes(token, args as Parameters<typeof getRecipes>[1])
    case 'search_recipes':
      return searchRecipes(token, args as Parameters<typeof searchRecipes>[1])
    // Terraforming tools
    case 'terraform':
      return terraform(token, args.action as TerraformAction, {
        facilityId: args.facilityId as number,
        targetCells: args.targetCells as Array<{ latIndex: number; lonIndex: number }>,
      })
    case 'get_terrain_modifications':
      return getTerrainModifications(token, { limit: args.limit as number, offset: args.offset as number })
    case 'get_effective_terrain':
      return getEffectiveTerrain(token, args.lat as number, args.lon as number)
    case 'get_terraform_cost_estimate':
      return getTerraformCostEstimate(token, args.action as TerraformAction, { targetCells: args.targetCells as Array<{ latIndex: number; lonIndex: number }> })
    // Power tools
    case 'get_power_grid_status':
      return getPowerGridStatus(token)
    // Environment tools
    case 'get_environmental_status':
      return getEnvironmentalStatus(token)
    case 'get_impact_forecast':
      return getImpactForecast(token)
    // Space tools
    case 'launch_mission':
      return launchMission(token, {
        facilityId: args.facilityId as number,
        missionType: args.missionType as string,
        target: args.target as string,
        payload: args.payload as string,
      })
    case 'assign_space_crew':
      return assignSpaceCrew(token, args.facilityId as number, args.crewCount as number)
    case 'get_space_status':
      return getSpaceStatus(token)
    // Game state tools
    case 'get_game_state':
      return getGameState(token)
    case 'get_event_log': {
      const db = createGameDb(token)
      const limit = Math.min((args.limit as number) || 50, 200)
      const offset = (args.offset as number) || 0
      const items = db.select().from(schema.events)
        .orderBy(desc(schema.events.id))
        .limit(limit)
        .offset(offset)
        .all()
      const countRow = db.select({ count: sql<number>`count(*)` }).from(schema.events).get()
      return { items, totalCount: countRow?.count ?? items.length, limit, offset }
    }
    case 'get_incidents':
      return getIncidents(token, { limit: args.limit as number, offset: args.offset as number })
    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}

export function getGameState(token: string) {
  const db = createGameDb(token)
  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()

  if (!meta) throw new Error('Game not found')

  const facilityCount = db.select().from(schema.facilities).all().length
  const transportCount = db.select().from(schema.transports).all().length
  const human = db.select().from(schema.humanity).where(eq(schema.humanity.key, 'global')).get()
  const env = db.select().from(schema.environment).where(eq(schema.environment.key, 'global')).get()

  return {
    tick: meta.tickCount,
    status: meta.status,
    difficulty: meta.difficulty,
    createdAt: meta.createdAt,
    facilityCount,
    transportCount,
    population: human?.population || 0,
    pollutionLevel: env?.pollutionLevel || 0,
    forestCoverage: env?.forestCoverage || 0,
    waterQuality: env?.waterQuality || 0,
    biodiversity: env?.biodiversity || 0,
  }
}

function logAction(
  token: string,
  toolName: string,
  args: Record<string, unknown>,
  status: 'success' | 'warning' | 'error',
  data: unknown,
  errorMessage?: string,
): void {
  const db = createGameDb(token)
  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()
  const tick = meta?.tickCount || 0

  db.insert(schema.actions).values({
    tick,
    timestamp: new Date().toISOString(),
    toolName,
    arguments: JSON.stringify(args),
    resultStatus: status,
    resultData: JSON.stringify(data),
    impactTags: '[]',
    stateSnapshot: null,
  }).run()

  db.insert(schema.events).values({
    tick,
    timestamp: new Date().toISOString(),
    type: 'mcp_call',
    message: `${toolName}: ${errorMessage || status}`,
    severity: status === 'error' ? 'error' : 'info',
    facilityId: null,
    data: JSON.stringify({ toolName, args, status, errorMessage }),
  }).run()
}

function emitGameEvents(token: string, toolName: string, args: Record<string, unknown>, result: unknown): void {
  const events: GameEvent[] = []

  switch (toolName) {
    case 'build_facility': {
      const data = result as { facilityId: number; status: string }
      events.push({ type: 'facility_built', facility: { id: data.facilityId, ...args } })
      break
    }
    case 'demolish_facility': {
      events.push({ type: 'facility_demolished', facilityId: args.facilityId })
      break
    }
    case 'set_production_target': {
      const details = getFacilityDetails(token, args.facilityId as number)
      if (details) events.push({ type: 'facility_updated', facility: details })
      break
    }
    case 'build_transport': {
      const data = result as { transportId?: number; id?: number }
      const transportId = data?.transportId ?? data?.id
      if (transportId) events.push({ type: 'transport_built', transport: { id: transportId, ...args } })
      break
    }
    case 'demolish_transport': {
      events.push({ type: 'transport_demolished', transportId: args.transportId })
      break
    }
    case 'assign_route': {
      events.push({ type: 'transport_built', transport: { id: args.transportId, resourceKey: args.resourceKey, flowRate: args.flowRate } })
      break
    }
    case 'survey_region': {
      events.push({ type: 'resource_updated' })
      break
    }
    case 'start_research': {
      events.push({ type: 'research_updated', node: { techId: args.techNodeId, status: 'InProgress' } })
      break
    }
    case 'terraform': {
      events.push({ type: 'terrain_modified', action: args.action, targetCells: args.targetCells })
      break
    }
    case 'launch_mission':
    case 'assign_space_crew': {
      events.push({ type: 'space_updated' })
      break
    }
  }

  // Every tool call advances a tick and may change environment/power
  const fullState = buildFullGameState(token, false)
  if (fullState) {
    events.push({ type: 'tick', tick: fullState.tick })
    events.push({ type: 'environment_updated', environment: fullState.environment })
  }
  events.push({ type: 'power_updated', power: getPowerGridStatus(token) })
  events.push({ type: 'event_logged', event: { toolName, args, status: 'success' } })
  events.push({ type: 'action_logged', action: { toolName, args } })

  // Game over check
  const state = getGameState(token)
  if (state.status === 'GameOver') {
    events.push({ type: 'game_over', meta: state })
  }

  for (const e of events) {
    publish(token, e)
  }
}