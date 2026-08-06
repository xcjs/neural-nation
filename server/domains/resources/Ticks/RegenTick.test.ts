import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createGame } from '../../../../test/helpers';
import { createGameDb, getDataDir } from '../../../db/client';
import { schema } from '../../../db/schema';
import { RegenTick } from './RegenTick';

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

function insertDeposit(resourceKey: string, category: string, surface: number, quantity: number, remaining: number, unit: string = 't'): number {
  return db.insert(schema.resources).values({
    resourceKey,
    name: resourceKey,
    category,
    lat: 0,
    lon: 0,
    quantity,
    remaining,
    grade: 0.5,
    discovered: 1,
    surface,
    depth: 0,
    unit,
  }).returning().get().id;
}

describe('regenTick', () => {
  it('regenerates renewable surface deposits', () => {
    const id = insertDeposit('wood', 'Renewable', 1, 1000, 500);
    new RegenTick(db).process(1);
    const row = db.select().from(schema.resources).where(eq(schema.resources.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.remaining).toBeGreaterThan(500);
  });

  it('does NOT regenerate non-renewable surface deposits', () => {
    const id = insertDeposit('coal', 'NonRenewable', 1, 1000, 500);
    new RegenTick(db).process(1);
    const row = db.select().from(schema.resources).where(eq(schema.resources.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.remaining).toBe(500);
  });

  it('does NOT regenerate non-surface renewable deposits', () => {
    const id = insertDeposit('wood', 'Renewable', 0, 1000, 500);
    new RegenTick(db).process(1);
    const row = db.select().from(schema.resources).where(eq(schema.resources.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.remaining).toBe(500);
  });

  it('clamps regen to quantity cap', () => {
    const id = insertDeposit('wood', 'Renewable', 1, 1000, 999.99);
    new RegenTick(db).process(1);
    const row = db.select().from(schema.resources).where(eq(schema.resources.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.remaining).toBeLessThanOrEqual(1000);
  });
});
