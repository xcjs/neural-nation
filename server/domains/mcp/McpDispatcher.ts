import type { IDbConnection } from '../db/IDbConnection';
import type { GameEvent, IEventBus } from '../events/IEventBus';
import type { FacilityService } from '../facilities/FacilityService';
import type { IGameRepository } from '../game/Repositories/IGameRepository';
import type { PowerService } from '../power/PowerService';
import type { TickProcessor } from '../tick/TickProcessor';
import type { GameTools } from './GameTools';
import type { IToolRegistry } from './IToolRegistry';
import type { ToolCallResult } from './Models/ToolCallResult';
import { eq } from 'drizzle-orm';
import { GameStatus } from '../../../lib/types/game';
import { schema } from '../../db/schema';

const READ_ONLY_TOOLS = new Set([
  'get_game_state',
  'get_event_log',
  'get_incidents',
  'list_facilities',
  'get_facility_details',
  'get_discovered_resources',
  'get_resource_overview',
  'get_resource_details',
  'get_resource_stockpile',
  'search_resources',
  'search_facilities',
  'list_transports',
  'get_supply_chain_status',
  'get_terrain_path',
  'get_tech_tree',
  'get_recipes',
  'search_recipes',
  'get_terrain_modifications',
  'get_effective_terrain',
  'get_terraform_cost_estimate',
  'get_power_grid_status',
  'get_environmental_status',
  'get_impact_forecast',
  'get_space_status',
]);

export class McpDispatcher {
  constructor(
    private readonly toolRegistry: IToolRegistry,
    private readonly gameRepo: IGameRepository,
    private readonly dbConnection: IDbConnection,
    private readonly eventBus: IEventBus,
    private readonly tickProcessor: TickProcessor,
    private readonly gameTools: GameTools,
    private readonly facilityService: FacilityService,
    private readonly powerService: PowerService,
  ) {}

  executeTool(token: string, toolName: string, args: Record<string, unknown>): ToolCallResult {
    try {
      const gameState = this.gameTools.getGameState();
      if (gameState.status === GameStatus.GameOver) {
        return { status: 'error', data: null, errorMessage: 'Game is over' };
      }
      if (gameState.status === GameStatus.Paused && !READ_ONLY_TOOLS.has(toolName)) {
        return { status: 'error', data: null, errorMessage: 'Game is paused — only read-only tools allowed' };
      }

      const result = this.toolRegistry.execute(toolName, args);

      const tickResult = this.tickProcessor.process();

      this.gameRepo.updateLastActive(new Date().toISOString());

      const loggedEvent = this.logAction(toolName, args, 'success', result, tickResult.tickCount);

      this.emitGameEvents(token, toolName, args, result, loggedEvent);

      return { status: 'success', data: result };
    }
    catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logAction(toolName, args, 'error', null, undefined, errorMessage);
      return { status: 'error', data: null, errorMessage };
    }
  }

  getGameState() {
    return this.gameTools.getGameState();
  }

  private logAction(
    toolName: string,
    args: Record<string, unknown>,
    status: 'success' | 'warning' | 'error',
    data: unknown,
    tickOverride?: number,
    errorMessage?: string,
  ): { id: number; tick: number; timestamp: string; type: string; message: string; severity: string; facilityId: number | null; data: string | null } {
    const db = this.dbConnection.getDb();
    const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get();
    const tick = tickOverride ?? meta?.tickCount ?? 0;
    const timestamp = new Date().toISOString();
    const message = `${toolName}: ${errorMessage || status}`;
    const severity = status === 'error' ? 'error' : 'info';

    db.insert(schema.actions).values({
      tick,
      timestamp,
      toolName,
      arguments: JSON.stringify(args),
      resultStatus: status,
      resultData: JSON.stringify(data),
      impactTags: '[]',
      stateSnapshot: null,
    }).run();

    const eventRow = db.insert(schema.events).values({
      tick,
      timestamp,
      type: 'mcp_call',
      message,
      severity,
      facilityId: null,
      data: JSON.stringify({ toolName, args, status, errorMessage }),
    }).returning().get();

    return {
      id: eventRow.id,
      tick: eventRow.tick,
      timestamp: eventRow.timestamp,
      type: eventRow.type,
      message: eventRow.message,
      severity: eventRow.severity,
      facilityId: eventRow.facilityId,
      data: eventRow.data,
    };
  }

  private emitGameEvents(token: string, toolName: string, args: Record<string, unknown>, result: unknown, loggedEvent: { id: number; tick: number; timestamp: string; type: string; message: string; severity: string; facilityId: number | null; data: string | null }): void {
    const events: GameEvent[] = [];

    switch (toolName) {
      case 'build_facility': {
        const data = result as { facilityId: number; status: string };
        events.push({ type: 'facility_built', facility: { id: data.facilityId, ...args } });
        break;
      }
      case 'demolish_facility': {
        events.push({ type: 'facility_demolished', facilityId: args.facilityId });
        break;
      }
      case 'set_production_target': {
        const details = this.facilityService.getFacilityDetails(args.facilityId as number);
        if (details)
          events.push({ type: 'facility_updated', facility: details });
        break;
      }
      case 'build_transport': {
        const data = result as { transportId?: number; id?: number };
        const transportId = data?.transportId ?? data?.id;
        if (transportId)
          events.push({ type: 'transport_built', transport: { id: transportId, ...args } });
        break;
      }
      case 'demolish_transport': {
        events.push({ type: 'transport_demolished', transportId: args.transportId });
        break;
      }
      case 'assign_route': {
        events.push({ type: 'transport_built', transport: { id: args.transportId, resourceKey: args.resourceKey, flowRate: args.flowRate } });
        break;
      }
      case 'survey_region': {
        events.push({ type: 'resource_updated' });
        break;
      }
      case 'start_research': {
        events.push({ type: 'research_updated', node: { techId: args.techNodeId, status: 'InProgress' } });
        break;
      }
      case 'terraform': {
        events.push({ type: 'terrain_modified', action: args.action, targetCells: args.targetCells });
        break;
      }
      case 'launch_mission':
      case 'assign_space_crew': {
        events.push({ type: 'space_updated' });
        break;
      }
    }

    events.push({ type: 'tick', tick: loggedEvent.tick });
    events.push({ type: 'power_updated', power: this.powerService.getPowerGridStatus() });
    events.push({ type: 'event_logged', event: loggedEvent });
    events.push({ type: 'action_logged', action: { toolName, args, tick: loggedEvent.tick } });

    const state = this.gameTools.getGameState();
    if (state.status === 'GameOver') {
      events.push({ type: 'game_over', meta: state });
    }

    for (const e of events) {
      this.eventBus.publish(token, e);
    }
  }
}
