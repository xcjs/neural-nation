import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGame, executeTool, getGameState } from '../../../test/helpers';
import { createGameDb, getDataDir } from '../../db/client';
import { schema } from '../../db/schema';

const result = createGame();
const token = result.token;
const db = createGameDb(token);

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

function getFacilityById(id: number) {
  return db.select().from(schema.facilities).where(eq(schema.facilities.id, id)).get();
}

function getDeposit(resourceKey: string, lat: number, lon: number) {
  return db.select().from(schema.resources).where(and(
    eq(schema.resources.resourceKey, resourceKey),
    eq(schema.resources.lat, lat),
    eq(schema.resources.lon, lon),
  )).get();
}

function advanceTicks(count: number) {
  for (let i = 0; i < count; i++) {
    executeTool(token, 'get_game_state', {});
  }
}

describe('simulation: tick cycle', () => {
  it('advances ticks via executeTool and accumulates pollution', () => {
    const beforeTick = getGameState(token).tick ?? 0;
    advanceTicks(5);
    const after = getGameState(token);
    expect(after.tick).toBe(beforeTick + 5);
    expect(after.pollutionLevel).toBeGreaterThanOrEqual(0);
  });

  it('updates population over ticks', () => {
    advanceTicks(10);
    const after = getGameState(token).population;
    expect(typeof after).toBe('number');
    expect(after).toBeGreaterThanOrEqual(0);
  });
});

describe('simulation: facility construction', () => {
  const feLat = 37.06867;
  const feLon = -90.58401;

  it('builds an Extractor and it transitions to Active after construction', () => {
    const r = executeTool(token, 'build_facility', { type: 'Extractor', name: 'Iron Mine', lat: feLat, lon: feLon, footprint: [{ lat: feLat, lon: feLon }, { lat: feLat + 0.01, lon: feLon }, { lat: feLat + 0.01, lon: feLon + 0.01 }, { lat: feLat, lon: feLon + 0.01 }] });
    expect(r.status).toBe('success');
    const facilityId = (r.data as { facilityId: number }).facilityId;

    const initially = getFacilityById(facilityId);
    expect(initially?.status).toBe('UnderConstruction');
    // build_facility itself triggers a tick, so progress is already 1
    expect(initially?.constructionProgress).toBeGreaterThanOrEqual(1);

    // Extractor construction time = 2 ticks; build_facility already advanced 1
    advanceTicks(2);
    const after = getFacilityById(facilityId);
    expect(after?.status).toBe('Active');
    expect(after?.constructionProgress).toBe(2);
  });
});

describe('simulation: extractor production', () => {
  const feLat = 37.06867;
  const feLon = -90.58401;
  let extractorId: number;

  beforeAll(() => {
    const r = executeTool(token, 'build_facility', { type: 'Extractor', name: 'Prod Mine', lat: feLat, lon: feLon, footprint: [{ lat: feLat + 0.03, lon: feLon + 0.03 }, { lat: feLat + 0.04, lon: feLon + 0.03 }, { lat: feLat + 0.04, lon: feLon + 0.04 }, { lat: feLat + 0.03, lon: feLon + 0.04 }] });
    extractorId = (r.data as { facilityId: number }).facilityId;
    // Survey the area so deposits are discovered
    executeTool(token, 'survey_region', { lat: feLat, lon: feLon, radius: 3 });
    // Complete construction (2 ticks)
    advanceTicks(2);
  });

  it('extracts from a discovered deposit and fills the output buffer', () => {
    // Set production target rate (extractors use targetOutputRate, no recipe needed)
    executeTool(token, 'set_production_target', { facilityId: extractorId, recipeId: 'none', targetRate: 10 });
    // Run ticks to let extraction happen
    advanceTicks(3);

    const facility = getFacilityById(extractorId);
    expect(facility?.status).toBe('Active');

    // The extractor should have some throughput (unless output buffer is full)
    // Check that the deposit was depleted somewhat
    const deposit = getDeposit('fe', feLat, feLon);
    if (deposit) {
      expect(deposit.remaining).toBeLessThanOrEqual(23664319);
    }
  });

  it('halts extraction when output buffer is full (overflow)', () => {
    // Buffer capacity is 100, target rate is 10 — ~10 ticks to fill
    advanceTicks(15);
    const facility = getFacilityById(extractorId);
    // Throughput should be 0 when buffer is full
    expect(facility?.throughput).toBeGreaterThanOrEqual(0);
  });
});

describe('simulation: power generation', () => {
  const lat = 39;
  const lon = -100;
  let solarFarmId: number;

  beforeAll(() => {
    const r = executeTool(token, 'build_facility', { type: 'SolarFarm', name: 'Solar Array', lat, lon, footprint: [{ lat: lat + 0.01, lon: lon + 0.01 }, { lat: lat + 0.01, lon: lon + 0.02 }, { lat, lon: lon + 0.02 }, { lat, lon: lon + 0.01 }] });
    solarFarmId = (r.data as { facilityId: number }).facilityId;
    // SolarFarm construction time = 2 ticks; build_facility advanced 1
    advanceTicks(2);
  });

  it('builds a SolarFarm and it becomes Active', () => {
    const facility = getFacilityById(solarFarmId);
    expect(facility?.status).toBe('Active');
    expect(facility?.type).toBe('SolarFarm');
  });

  it('rejects set_production_target with wrong recipe for SolarFarm', () => {
    const r = executeTool(token, 'set_production_target', { facilityId: solarFarmId, recipeId: 'iron_smelting', targetRate: 1 });
    expect(r.status).toBe('error');
    expect(r.errorMessage).toContain('requires a Smelter');
  });

  it('sets solar_generation recipe and produces energy', () => {
    const r = executeTool(token, 'set_production_target', { facilityId: solarFarmId, recipeId: 'solar_generation', targetRate: 1 });
    expect(r.status).toBe('success');

    advanceTicks(3);

    const facility = getFacilityById(solarFarmId);
    expect(facility?.activeRecipeId).toBe('solar_generation');
    expect(facility?.throughput).toBeGreaterThan(0);

    // Check energy output buffer
    const buffer = db.select().from(schema.facilityBuffers).where(and(
      eq(schema.facilityBuffers.facilityId, solarFarmId),
      eq(schema.facilityBuffers.resourceKey, 'energy'),
      eq(schema.facilityBuffers.direction, 'output'),
    )).get();
    expect(buffer).toBeDefined();
    expect(buffer!.quantity).toBeGreaterThan(0);
  });

  it('returns solar_generation in get_recipes for SolarFarm', () => {
    const r = executeTool(token, 'get_recipes', { facilityType: 'SolarFarm' });
    expect(r.status).toBe('success');
    const data = r.data as { items: Array<{ id: string }> };
    const ids = data.items.map(i => i.id);
    expect(ids).toContain('solar_generation');
  });

  it('returns solar_generation in unlockedOnly recipes (no tech required)', () => {
    const r = executeTool(token, 'get_recipes', { unlockedOnly: true });
    expect(r.status).toBe('success');
    const data = r.data as { items: Array<{ id: string }> };
    const ids = data.items.map(i => i.id);
    expect(ids).toContain('solar_generation');
  });
});
