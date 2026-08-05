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

function advanceTicks(count: number) {
  for (let i = 0; i < count; i++) {
    executeTool(token, 'get_game_state', {});
  }
}

describe('simulation: recipe production chain', () => {
  beforeAll(() => {
    // Complete metallurgy_1 tech (required by iron_smelting recipe) for all tests in this block
    db.insert(schema.gameResearch).values({
      techId: 'metallurgy_1',
      status: 'Completed',
      progress: 10,
      startedAtTick: 0,
      completedAtTick: 5,
      labFacilityId: null,
    }).run();
  });

  it('builds a Smelter, sets iron_smelting recipe, and verifies input/output buffers', () => {
    const r = executeTool(token, 'build_facility', { type: 'Smelter', name: 'Smelter 1', lat: 37.15, lon: -90.50, footprint: [{ lat: 37.15, lon: -90.50 }, { lat: 37.16, lon: -90.50 }, { lat: 37.16, lon: -90.49 }, { lat: 37.15, lon: -90.49 }] });
    expect(r.status).toBe('success');
    const smelterId = (r.data as { facilityId: number }).facilityId;

    // Complete construction (3 ticks for Smelter)
    advanceTicks(3);
    expect(getFacilityById(smelterId)?.status).toBe('Active');

    // Build a SolarFarm and PowerLine to power the smelter
    const solar = executeTool(token, 'build_facility', {
      type: 'SolarFarm',
      name: 'Power Solar 1',
      lat: 37.14,
      lon: -90.50,
      footprint: [
        { lat: 37.14, lon: -90.50 },
        { lat: 37.15, lon: -90.50 },
        { lat: 37.15, lon: -90.49 },
        { lat: 37.14, lon: -90.49 },
      ],
    });
    const solarId = (solar.data as { facilityId: number }).facilityId;
    executeTool(token, 'build_transport', {
      type: 'PowerLine',
      fromFacilityId: solarId,
      toFacilityId: smelterId,
    });
    executeTool(token, 'set_production_target', {
      facilityId: solarId,
      recipeId: 'solar_generation',
      targetRate: 1,
    });
    advanceTicks(3); // solar construction + power tick

    // Set iron_smelting recipe
    const recipe = executeTool(token, 'set_production_target', { facilityId: smelterId, recipeId: 'iron_smelting', targetRate: 1 });
    expect(recipe.status).toBe('success');

    // The smelter should have created input buffer for 'fe' and 'coal' and output buffer for 'iron'
    // Run a tick to let production logic create buffers
    advanceTicks(1);

    // Without iron ore in the input buffer, production should be 0 (missing required input)
    const facility = getFacilityById(smelterId);
    expect(facility?.throughput).toBe(0);
  });

  it('produces iron when iron ore and coal are available in input buffer', () => {
    const r = executeTool(token, 'build_facility', { type: 'Smelter', name: 'Smelter 2', lat: 37.17, lon: -90.50, footprint: [{ lat: 37.17, lon: -90.50 }, { lat: 37.18, lon: -90.50 }, { lat: 37.18, lon: -90.49 }, { lat: 37.17, lon: -90.49 }] });
    const smelterId = (r.data as { facilityId: number }).facilityId;
    advanceTicks(3);
    expect(getFacilityById(smelterId)?.status).toBe('Active');

    // Build a SolarFarm and PowerLine to power the smelter
    const solar = executeTool(token, 'build_facility', {
      type: 'SolarFarm',
      name: 'Test Solar',
      lat: 37.19,
      lon: -90.50,
      footprint: [
        { lat: 37.19, lon: -90.50 },
        { lat: 37.20, lon: -90.50 },
        { lat: 37.20, lon: -90.49 },
        { lat: 37.19, lon: -90.49 },
      ],
    });
    const solarId = (solar.data as { facilityId: number }).facilityId;

    executeTool(token, 'build_transport', {
      type: 'PowerLine',
      fromFacilityId: solarId,
      toFacilityId: smelterId,
    });

    // Set solar generation recipe so the solar farm produces
    executeTool(token, 'set_production_target', {
      facilityId: solarId,
      recipeId: 'solar_generation',
      targetRate: 1,
    });

    // Complete solar farm construction (3 ticks) + power tick
    advanceTicks(3);

    executeTool(token, 'set_production_target', { facilityId: smelterId, recipeId: 'iron_smelting', targetRate: 1 });
    advanceTicks(1);

    // Manually insert iron ore AND coal into the input buffers to simulate transport delivery
    // iron_smelting requires fe:2t + coal:0.5t per cycle
    for (const key of ['fe', 'coal']) {
      const existing = db.select().from(schema.facilityBuffers).where(and(
        eq(schema.facilityBuffers.facilityId, smelterId),
        eq(schema.facilityBuffers.resourceKey, key),
        eq(schema.facilityBuffers.direction, 'input'),
      )).get();

      if (existing) {
        db.update(schema.facilityBuffers)
          .set({ quantity: 10 })
          .where(eq(schema.facilityBuffers.id, existing.id))
          .run();
      }
      else {
        db.insert(schema.facilityBuffers).values({
          facilityId: smelterId,
          resourceKey: key,
          quantity: 10,
          capacity: 100,
          unit: 't',
          direction: 'input',
        }).run();
      }
    }

    advanceTicks(2);

    // Check output buffer for 'iron'
    const outputBuffer = db.select().from(schema.facilityBuffers).where(and(
      eq(schema.facilityBuffers.facilityId, smelterId),
      eq(schema.facilityBuffers.resourceKey, 'iron'),
      eq(schema.facilityBuffers.direction, 'output'),
    )).get();

    if (outputBuffer) {
      expect(outputBuffer.quantity).toBeGreaterThan(0);
    }

    const facility = getFacilityById(smelterId);
    expect(facility?.throughput).toBeGreaterThan(0);
  });
});

describe('simulation: transport flows', () => {
  it('moves resources from source output buffer to destination input buffer', () => {
    // Build two facilities near each other
    const mine = executeTool(token, 'build_facility', { type: 'Extractor', name: 'Src Mine', lat: 37.10, lon: -90.60, footprint: [{ lat: 37.10, lon: -90.60 }, { lat: 37.11, lon: -90.60 }, { lat: 37.11, lon: -90.59 }, { lat: 37.10, lon: -90.59 }] });
    const smelter = executeTool(token, 'build_facility', { type: 'Smelter', name: 'Dst Smelter', lat: 37.12, lon: -90.61, footprint: [{ lat: 37.12, lon: -90.61 }, { lat: 37.13, lon: -90.61 }, { lat: 37.13, lon: -90.60 }, { lat: 37.12, lon: -90.60 }] });
    const mineId = (mine.data as { facilityId: number }).facilityId;
    const smelterId = (smelter.data as { facilityId: number }).facilityId;

    // Complete construction
    advanceTicks(3);

    // Survey so mine can find deposits
    executeTool(token, 'survey_region', { lat: 37.10, lon: -90.60, radius: 3 });

    // Build transport link
    const transport = executeTool(token, 'build_transport', {
      type: 'Conveyor',
      fromFacilityId: mineId,
      toFacilityId: smelterId,
    });
    expect(transport.status).toBe('success');
    const transportId = (transport.data as { transportId: number }).transportId;

    // Assign route for iron ore
    executeTool(token, 'assign_route', { transportId, resourceKey: 'fe', flowRate: 5 });

    // Let the mine extract and fill output buffer
    advanceTicks(5);

    const sourceOutput = db.select().from(schema.facilityBuffers).where(and(
      eq(schema.facilityBuffers.facilityId, mineId),
      eq(schema.facilityBuffers.resourceKey, 'fe'),
      eq(schema.facilityBuffers.direction, 'output'),
    )).get();

    // Run more ticks to let transport move resources
    advanceTicks(5);

    const destInput = db.select().from(schema.facilityBuffers).where(and(
      eq(schema.facilityBuffers.facilityId, smelterId),
      eq(schema.facilityBuffers.resourceKey, 'fe'),
      eq(schema.facilityBuffers.direction, 'input'),
    )).get();

    // If source had ore, destination should have received some
    if (sourceOutput && sourceOutput.quantity > 0) {
      expect(destInput).toBeDefined();
      if (destInput) {
        expect(destInput.quantity).toBeGreaterThan(0);
      }
    }
  });
});

describe('simulation: tech progression', () => {
  it('researches basic_construction and it completes after enough ticks', () => {
    // basic_construction has no prerequisites and researchTime=5
    // Need a ResearchLab, but that requires precision_manufacturing tech...
    // So test research completion via direct DB manipulation instead
    db.insert(schema.gameResearch).values({
      techId: 'basic_construction',
      status: 'InProgress',
      progress: 0,
      startedAtTick: getGameState(token).tick,
      completedAtTick: null,
      labFacilityId: null,
    }).run();

    // Advance 5+ ticks for research to complete (researchTime=5)
    advanceTicks(6);

    const research = db.select().from(schema.gameResearch).where(eq(schema.gameResearch.techId, 'basic_construction')).get();

    expect(research?.status).toBe('Completed');
    expect(research?.completedAtTick).not.toBeNull();
  });
});

describe('simulation: lose condition', () => {
  it('does not trigger game over with active stockpiles', () => {
    const state = getGameState(token);
    expect(state.status).not.toBe('GameOver');
  });
});

describe('simulation: storage-bridge to global stockpile', () => {
  it('flows resources from a Storage facility input buffer to the global stockpile', () => {
    const r = executeTool(token, 'build_facility', {
      type: 'Storage',
      name: 'Bridge Storage',
      lat: 37.22,
      lon: -90.50,
      footprint: [
        { lat: 37.22, lon: -90.50 },
        { lat: 37.23, lon: -90.50 },
        { lat: 37.23, lon: -90.49 },
        { lat: 37.22, lon: -90.49 },
      ],
    });
    expect(r.status).toBe('success');
    const storageId = (r.data as { facilityId: number }).facilityId;

    advanceTicks(3);
    expect(getFacilityById(storageId)?.status).toBe('Active');

    const existing = db.select().from(schema.facilityBuffers).where(and(
      eq(schema.facilityBuffers.facilityId, storageId),
      eq(schema.facilityBuffers.resourceKey, 'fe'),
      eq(schema.facilityBuffers.direction, 'input'),
    )).get();

    if (existing) {
      db.update(schema.facilityBuffers)
        .set({ quantity: 25 })
        .where(eq(schema.facilityBuffers.id, existing.id))
        .run();
    }
    else {
      db.insert(schema.facilityBuffers).values({
        facilityId: storageId,
        resourceKey: 'fe',
        quantity: 25,
        capacity: 1000,
        unit: 't',
        direction: 'input',
      }).run();
    }

    const stockpileBefore = db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, 'fe')).get();
    const beforeQty = stockpileBefore?.quantity ?? 0;

    advanceTicks(3);

    const inputBuffer = db.select().from(schema.facilityBuffers).where(and(
      eq(schema.facilityBuffers.facilityId, storageId),
      eq(schema.facilityBuffers.resourceKey, 'fe'),
      eq(schema.facilityBuffers.direction, 'input'),
    )).get();
    expect(inputBuffer).toBeDefined();
    expect(inputBuffer!.quantity).toBeLessThan(25);

    const stockpileAfter = db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, 'fe')).get();
    expect(stockpileAfter).toBeDefined();
    expect(stockpileAfter!.quantity).toBeGreaterThan(beforeQty);
  });

  it('routes resources FROM a Storage facility input buffer to a downstream facility', () => {
    // Use the Storage facility built in the previous test (search for it by type)
    const storageFacility = db.select().from(schema.facilities).where(eq(schema.facilities.type, 'Storage')).all().pop();
    expect(storageFacility).toBeDefined();
    const storageId = storageFacility!.id;

    // Build a downstream facility (another Storage as a sink)
    const r = executeTool(token, 'build_facility', {
      type: 'Storage',
      name: 'Downstream Storage',
      lat: 37.24,
      lon: -90.50,
      footprint: [
        { lat: 37.24, lon: -90.50 },
        { lat: 37.25, lon: -90.50 },
        { lat: 37.25, lon: -90.49 },
        { lat: 37.24, lon: -90.49 },
      ],
    });
    expect(r.status).toBe('success');
    const downstreamId = (r.data as { facilityId: number }).facilityId;
    advanceTicks(3);
    expect(getFacilityById(downstreamId)?.status).toBe('Active');

    // Build a Conveyor from the upstream Storage to the downstream facility
    const t = executeTool(token, 'build_transport', {
      type: 'Conveyor',
      fromFacilityId: storageId,
      toFacilityId: downstreamId,
    });
    expect(t.status).toBe('success');
    const transportId = (t.data as { transportId: number }).transportId;

    // Seed the upstream Storage's fe input buffer
    const existing = db.select().from(schema.facilityBuffers).where(and(
      eq(schema.facilityBuffers.facilityId, storageId),
      eq(schema.facilityBuffers.resourceKey, 'fe'),
      eq(schema.facilityBuffers.direction, 'input'),
    )).get();
    if (existing) {
      db.update(schema.facilityBuffers)
        .set({ quantity: 20 })
        .where(eq(schema.facilityBuffers.id, existing.id))
        .run();
    }
    else {
      db.insert(schema.facilityBuffers).values({
        facilityId: storageId,
        resourceKey: 'fe',
        quantity: 20,
        capacity: 1000,
        unit: 't',
        direction: 'input',
      }).run();
    }

    // Assigning a route from a Storage (input-buffer source) should now succeed (was: error 'no output buffer')
    const assign = executeTool(token, 'assign_route', { transportId, resourceKey: 'fe', flowRate: 10 });
    expect(assign.status).toBe('success');

    // Re-seed the upstream Storage input buffer after the assign_route tick.
    const seeded = db.select().from(schema.facilityBuffers).where(and(
      eq(schema.facilityBuffers.facilityId, storageId),
      eq(schema.facilityBuffers.resourceKey, 'fe'),
      eq(schema.facilityBuffers.direction, 'input'),
    )).get();
    if (seeded) {
      db.update(schema.facilityBuffers)
        .set({ quantity: 20 })
        .where(eq(schema.facilityBuffers.id, seeded.id))
        .run();
    }

    advanceTicks(1);

    // TransportFlowTick runs before StorageBridgeTick. With 20t seeded and transport flowRate=10:
    // transport pulls 10 (source 20→10), then bridge drains 10 (source 10→0). Source should be 0.
    // This proves the onward transport pulled from the Storage's input buffer (Bug #6 fix).
    const sourceInputAfter = db.select().from(schema.facilityBuffers).where(and(
      eq(schema.facilityBuffers.facilityId, storageId),
      eq(schema.facilityBuffers.resourceKey, 'fe'),
      eq(schema.facilityBuffers.direction, 'input'),
    )).get();
    expect(sourceInputAfter).toBeDefined();
    expect(sourceInputAfter!.quantity).toBe(0);
  });
});
