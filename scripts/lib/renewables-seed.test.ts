import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { seedRenewableDeposits } from './renewables-seed';

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

describe('renewables-seed', () => {
  it('emits geolocated deposits for all 7 renewable keys', () => {
    const db = createTestDb();
    // Use a nonexistent data dir so forest-density fallback applies
    const result = seedRenewableDeposits(db, '/nonexistent');
    expect(result.insertedRows).toBeGreaterThan(0);

    const keys = ['solar', 'wind', 'hydro', 'water', 'arableland', 'wood', 'biomass'];
    for (const key of keys) {
      const rows = db.prepare(`SELECT * FROM resources WHERE resource_key = ? AND lat IS NOT NULL`).all(key) as Array<{ lat: number; lon: number }>;
      expect(rows.length, `expected ${key} deposits with non-null lat/lon`).toBeGreaterThan(0);
    }
  });

  it('is idempotent (second run is a no-op)', () => {
    const db = createTestDb();
    const first = seedRenewableDeposits(db, '/nonexistent');
    expect(first.insertedRows).toBeGreaterThan(0);

    const second = seedRenewableDeposits(db, '/nonexistent');
    expect(second.insertedRows).toBe(0);
  });

  it('solar deposits have MW unit', () => {
    const db = createTestDb();
    seedRenewableDeposits(db, '/nonexistent');
    const solar = db.prepare(`SELECT unit FROM resources WHERE resource_key = 'solar' LIMIT 1`).get() as { unit: string };
    expect(solar.unit).toBe('MW');
  });

  it('water deposits use tonnes unit', () => {
    const db = createTestDb();
    seedRenewableDeposits(db, '/nonexistent');
    const water = db.prepare(`SELECT unit FROM resources WHERE resource_key = 'water' LIMIT 1`).get() as { unit: string };
    expect(water.unit).toBe('t');
  });
});
