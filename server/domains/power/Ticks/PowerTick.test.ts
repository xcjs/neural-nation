import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createGame, executeTool } from '../../../../test/helpers';
import { createGameDb, getDataDir } from '../../../db/client';
import { schema } from '../../../db/schema';
import { PowerTick } from './PowerTick';

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

function getFacility(id: number) {
  return db.select().from(schema.facilities).where(eq(schema.facilities.id, id)).get();
}

function advanceTicks(count: number) {
  for (let i = 0; i < count; i++) {
    executeTool(token, 'get_game_state', {});
  }
}

function buildFacility(type: string, name: string, lat: number, lon: number) {
  const r = executeTool(token, 'build_facility', {
    type,
    name,
    lat,
    lon,
    footprint: [
      { lat, lon },
      { lat: lat + 0.01, lon },
      { lat: lat + 0.01, lon: lon + 0.01 },
      { lat, lon: lon + 0.01 },
    ],
  });
  return (r.data as { facilityId: number }).facilityId;
}

function buildPowerLine(fromId: number, toId: number) {
  const r = executeTool(token, 'build_transport', {
    type: 'PowerLine',
    fromFacilityId: fromId,
    toFacilityId: toId,
  });
  return (r.data as { transportId: number }).transportId;
}

describe('powerTick', () => {
  it('powers a smelter connected to a solar farm via PowerLine', () => {
    const solarId = buildFacility('SolarFarm', 'Test Solar', 37.0, -90.0);
    const smelterId = buildFacility('Smelter', 'Test Smelter', 37.01, -90.0);
    advanceTicks(3); // complete construction

    // Set solar farm production target so it has rated output
    executeTool(token, 'set_production_target', {
      facilityId: solarId,
      recipeId: 'solar_generation',
      targetRate: 20,
    });

    buildPowerLine(solarId, smelterId);

    // Run PowerTick directly (not yet wired into pipeline)
    new PowerTick(db).process(0);

    const smelter = getFacility(smelterId);
    expect(smelter?.powerConnected).toBe(1);
    expect(smelter?.powerThrottle).toBe(1.0);
  });

  it('leaves isolated smelter unpowered', () => {
    const smelterId = buildFacility('Smelter', 'Isolated Smelter', 38.0, -90.0);
    advanceTicks(3);

    new PowerTick(db).process(0);

    const smelter = getFacility(smelterId);
    expect(smelter?.powerConnected).toBe(0);
  });

  it('handles multiple independent grids', () => {
    const solarA = buildFacility('SolarFarm', 'Solar A', 39.0, -90.0);
    const smelterA = buildFacility('Smelter', 'Smelter A', 39.01, -90.0);
    const solarB = buildFacility('SolarFarm', 'Solar B', 40.0, -90.0);
    const smelterB = buildFacility('Smelter', 'Smelter B', 40.01, -90.0);
    advanceTicks(3);

    executeTool(token, 'set_production_target', { facilityId: solarA, recipeId: 'solar_generation', targetRate: 20 });
    executeTool(token, 'set_production_target', { facilityId: solarB, recipeId: 'solar_generation', targetRate: 20 });

    buildPowerLine(solarA, smelterA);
    buildPowerLine(solarB, smelterB);

    new PowerTick(db).process(0);

    expect(getFacility(smelterA)?.powerConnected).toBe(1);
    expect(getFacility(smelterB)?.powerConnected).toBe(1);
  });

  it('powers transitively through intermediate facilities', () => {
    const solarId = buildFacility('SolarFarm', 'Trans Solar', 41.0, -90.0);
    const storageId = buildFacility('Storage', 'Trans Storage', 41.01, -90.0);
    const smelterId = buildFacility('Smelter', 'Trans Smelter', 41.02, -90.0);
    advanceTicks(3);

    executeTool(token, 'set_production_target', { facilityId: solarId, recipeId: 'solar_generation', targetRate: 20 });

    buildPowerLine(solarId, storageId);
    buildPowerLine(storageId, smelterId);

    new PowerTick(db).process(0);

    expect(getFacility(smelterId)?.powerConnected).toBe(1);
  });

  it('self-powers isolated generators', () => {
    const solarId = buildFacility('SolarFarm', 'Iso Solar', 42.0, -90.0);
    advanceTicks(3);

    new PowerTick(db).process(0);

    const solar = getFacility(solarId);
    expect(solar?.powerConnected).toBe(1);
  });

  it('keeps extractors at throttle=1.0 even with no power', () => {
    const extractorId = buildFacility('Extractor', 'Iso Extractor', 43.0, -90.0);
    advanceTicks(3);

    new PowerTick(db).process(0);

    const extractor = getFacility(extractorId);
    expect(extractor?.powerThrottle).toBe(1.0);
  });
});
