import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { seedMcsProduction } from './mcs-seed';

const openDbs = new Set<Database.Database>();

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_key TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      lat REAL,
      lon REAL,
      quantity REAL NOT NULL,
      remaining REAL NOT NULL,
      grade REAL NOT NULL,
      discovered INTEGER DEFAULT 0,
      surface INTEGER DEFAULT 0,
      depth REAL,
      unit TEXT NOT NULL
    );
  `);
  openDbs.add(db);
  return db;
}

afterEach(() => {
  for (const db of Array.from(openDbs)) {
    db.close();
    openDbs.delete(db);
  }
});

describe('mcs-seed', () => {
  it('scales copper deposits to match global production × reserve factor', () => {
    const db = createTestDb();
    const insert = db.prepare(`INSERT INTO resources (resource_key, name, category, lat, lon, quantity, remaining, grade, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 't')`);
    // Two copper deposits with arbitrary tonnages
    insert.run('cu', 'Copper', 'Element', -30, 20, 5e6, 5e6, 0.01);
    insert.run('cu', 'Copper', 'Element', 40, -100, 1e7, 1e7, 0.01);

    const result = seedMcsProduction(db);

    expect(result.commoditiesAdjusted).toBeGreaterThan(0);
    const total = db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS total FROM resources WHERE resource_key = 'cu'`).get() as { total: number };
    // Global copper production = 22e6 t/year × 100 reserve factor = 2.2e9
    expect(total.total).toBeCloseTo(22e6 * 100, -6);
  });

  it('is idempotent (second run is a no-op)', () => {
    const db = createTestDb();
    const insert = db.prepare(`INSERT INTO resources (resource_key, name, category, lat, lon, quantity, remaining, grade, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 't')`);
    insert.run('cu', 'Copper', 'Element', -30, 20, 5e6, 5e6, 0.01);

    const first = seedMcsProduction(db);
    expect(first.totalDepositsAdjusted).toBeGreaterThan(0);

    const second = seedMcsProduction(db);
    expect(second.totalDepositsAdjusted).toBe(0);
  });

  it('preserves proportional share between deposits', () => {
    const db = createTestDb();
    const insert = db.prepare(`INSERT INTO resources (resource_key, name, category, lat, lon, quantity, remaining, grade, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 't')`);
    insert.run('cu', 'Copper', 'Element', -30, 20, 1e6, 1e6, 0.01); // 1/3 share
    insert.run('cu', 'Copper', 'Element', 40, -100, 2e6, 2e6, 0.01); // 2/3 share

    seedMcsProduction(db);

    const rows = db.prepare(`SELECT quantity FROM resources WHERE resource_key = 'cu' ORDER BY id`).all() as Array<{ quantity: number }>;
    const ratio = rows[1]!.quantity / rows[0]!.quantity;
    expect(ratio).toBeCloseTo(2, 1); // original ratio 2:1 preserved
  });
});
