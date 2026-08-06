import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createGame } from '../../../../test/helpers';
import { createGameDb, getDataDir } from '../../../db/client';
import { schema } from '../../../db/schema';
import { PopulationTick } from './PopulationTick';

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

function setEnvironment(pollution: number, forest: number, water: number, biodiversity: number) {
  db.update(schema.environment)
    .set({ pollutionLevel: pollution, forestCoverage: forest, waterQuality: water, biodiversity })
    .where(eq(schema.environment.key, 'global'))
    .run();
}

function setStockpile(key: string, quantity: number) {
  const existing = db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, key)).get();
  if (existing) {
    db.update(schema.stockpiles)
      .set({ quantity })
      .where(eq(schema.stockpiles.id, existing.id))
      .run();
  }
  else {
    db.insert(schema.stockpiles).values({
      resourceKey: key,
      facilityId: null,
      quantity,
      capacity: quantity * 10,
      unit: 't',
    }).run();
  }
}

function getPopulation() {
  return db.select().from(schema.humanity).where(eq(schema.humanity.key, 'global')).get()!;
}

function resetPopulation() {
  const human = getPopulation();
  db.update(schema.humanity)
    .set({ population: 8_100_000_000, welfare: 100 })
    .where(eq(schema.humanity.key, 'global'))
    .run();
  return human;
}

function runPopulationTickAndMeasureDecline(): number {
  const before = getPopulation().population;
  new PopulationTick(db).process(1);
  const after = getPopulation().population;
  return before - after;
}

describe('populationTick catastrophic stacking', () => {
  it('stacks famine + bad water (worse environment should not weaken decline)', () => {
    resetPopulation();
    setStockpile('food', 0);
    setStockpile('energy', 1000);
    setEnvironment(0, 100, 100, 100);
    const famineDecline = runPopulationTickAndMeasureDecline();
    expect(famineDecline).toBeGreaterThan(0);

    resetPopulation();
    setStockpile('food', 0);
    setStockpile('energy', 1000);
    setEnvironment(0, 100, 5, 100);
    const combinedDecline = runPopulationTickAndMeasureDecline();

    expect(combinedDecline).toBeGreaterThanOrEqual(famineDecline);
  });
});
