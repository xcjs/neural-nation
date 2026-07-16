import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createGame, createScopedContainer, executeTool, findRegistryEntry, getGameState } from '../../../test/helpers';
import { createGameDb, getDataDir } from '../../db/client';
import { schema } from '../../db/schema';
import { IToolRegistry } from '../mcp/IToolRegistry';

const result = createGame();
const token = result.token;

afterAll(() => {
  for (const ext of ['', '-shm', '-wal']) {
    try {
      rmSync(resolve(getDataDir(), `${token}.db${ext}`), { force: true });
    }
    catch {
      // ignore
    }
  }
});

describe('mCP end-to-end flow', () => {
  it('creates a game with token, publicToken, and mcpUrl', () => {
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(result.publicToken).toBeTruthy();
    expect(result.mcpUrl).toContain(token);
  });

  it('registers the token in the registry with Active status', () => {
    const entry = findRegistryEntry(token);
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('Active');
  });

  it('exposes >=25 MCP tools, each with an inputSchema', () => {
    const scope = createScopedContainer(token);
    const tools = scope.resolve(IToolRegistry).getToolDefinitions();
    expect(tools.length).toBeGreaterThanOrEqual(25);
    for (const t of tools) {
      expect(t.inputSchema).toBeDefined();
      expect(t.name).toBeTruthy();
    }
  });

  it('includes expected core tools', () => {
    const scope = createScopedContainer(token);
    const tools = scope.resolve(IToolRegistry).getToolDefinitions();
    const names = tools.map(t => t.name);
    for (const expected of [
      'survey_region',
      'build_facility',
      'list_facilities',
      'get_facility_details',
      'set_production_target',
      'build_transport',
      'assign_route',
      'get_tech_tree',
      'get_recipes',
      'get_environmental_status',
      'get_game_state',
      'get_event_log',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('returns initial game state at tick 0 with seeded population and no facilities', () => {
    const state = getGameState(token);
    expect(state.tick).toBe(0);
    expect(state.status).toBe('Active');
    expect(state.facilityCount).toBe(0);
    expect(state.population).toBeGreaterThan(0);
  });

  it('surveys a region and advances the tick to 1', () => {
    const r = executeTool(token, 'survey_region', { lat: 39, lon: -100, radius: 2 });
    expect(r.status).toBe('success');
    expect(typeof r.data).toBe('object');
    expect(getGameState(token).tick).toBe(1);
  });

  it('builds an Extractor facility and advances the tick to 2', () => {
    const r = executeTool(token, 'build_facility', { type: 'Extractor', name: 'Test Mine', lat: 39, lon: -100, footprint: [{ lat: 39.01, lon: -100.01 }, { lat: 39.01, lon: -99.99 }, { lat: 38.99, lon: -99.99 }, { lat: 38.99, lon: -100.01 }] });
    expect(r.status).toBe('success');
    const data = r.data as { facilityId: number; status: string };
    expect(typeof data.facilityId).toBe('number');
    expect(data.status).toBe('UnderConstruction');
    expect(getGameState(token).facilityCount).toBe(1);
    expect(getGameState(token).tick).toBe(2);
  });

  it('lists the built facility', () => {
    const r = executeTool(token, 'list_facilities', { limit: 10, offset: 0 });
    expect(r.status).toBe('success');
    const data = r.data as { items: Array<{ id: number }>; totalCount: number };
    expect(data.items).toHaveLength(1);
    expect(data.totalCount).toBe(1);
  });

  it('returns facility details with input/output buffer arrays', () => {
    const build = executeTool(token, 'list_facilities', { limit: 1, offset: 0 });
    const facilityId = (build.data as { items: Array<{ id: number }> }).items[0]!.id;
    const r = executeTool(token, 'get_facility_details', { facilityId });
    expect(r.status).toBe('success');
    const details = r.data as { id: number; status: string; constructionProgress: number; inputs: unknown[]; outputs: unknown[] };
    expect(details.id).toBe(facilityId);
    expect(details.status).toBe('Active');
    expect(details.constructionProgress).toBe(2);
    expect(Array.isArray(details.inputs)).toBe(true);
    expect(Array.isArray(details.outputs)).toBe(true);
  });

  it('rejects setting production target with wrong facility type (Extractor vs Smelter recipe)', () => {
    const build = executeTool(token, 'list_facilities', { limit: 1, offset: 0 });
    const facilityId = (build.data as { items: Array<{ id: number }> }).items[0]!.id;
    const r = executeTool(token, 'set_production_target', { facilityId, recipeId: 'iron_smelting', targetRate: 1 });
    expect(r.status).toBe('error');
    expect(r.errorMessage).toContain('requires a Smelter');
  });

  it('returns a tech tree with >=13 nodes', () => {
    const r = executeTool(token, 'get_tech_tree', {});
    expect(r.status).toBe('success');
    const tree = r.data as Array<{ id: string }>;
    expect(Array.isArray(tree)).toBe(true);
    expect(tree.length).toBeGreaterThanOrEqual(13);
  });

  it('returns >=5 recipes and only tech-free recipes unlocked when nothing is researched', () => {
    const all = executeTool(token, 'get_recipes', {});
    expect(all.status).toBe('success');
    const allData = all.data as { items: Array<{ id: string }>; totalCount: number };
    expect(allData.items.length).toBeGreaterThanOrEqual(5);

    const unlocked = executeTool(token, 'get_recipes', { unlockedOnly: true });
    const unlockedData = unlocked.data as { items: Array<{ id: string; techRequired: string | null }>; totalCount: number };
    expect(unlockedData.items.length).toBeGreaterThanOrEqual(1);
    expect(unlockedData.items.every(r => r.techRequired === null)).toBe(true);
  });

  it('returns environmental status with numeric pollutionLevel', () => {
    const r = executeTool(token, 'get_environmental_status', {});
    expect(r.status).toBe('success');
    const env = r.data as { environment: { pollutionLevel: number } };
    expect(typeof env.environment.pollutionLevel).toBe('number');
  });

  it('returns a resource overview', () => {
    const r = executeTool(token, 'get_resource_overview', {});
    expect(r.status).toBe('success');
  });

  it('returns event log with entries from tool calls (event_log table)', () => {
    const r = executeTool(token, 'get_event_log', { limit: 20, offset: 0 });
    expect(r.status).toBe('success');
    const data = r.data as { items: unknown[]; totalCount: number };
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.totalCount).toBeGreaterThan(0);
  });

  it('logs actions and events to the database on every tool call', () => {
    const db = createGameDb(token);
    const actions = db.select().from(schema.actions).all();
    const events = db.select().from(schema.events).all();
    expect(actions.length).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBe(actions.length);
  });

  it('returns an error for an unknown tool', () => {
    const r = executeTool(token, 'nonexistent_tool', {});
    expect(r.status).toBe('error');
    expect(r.errorMessage).toContain('Unknown tool');
  });

  it('advances the tick once per successful executeTool call (errors do not advance)', () => {
    const state = getGameState(token);
    // 13 total executeTool calls, 1 errored (nonexistent_tool)
    // set_production_target error doesn't count because it's caught before processTick
    expect(state.tick).toBe(12);
  });
});
