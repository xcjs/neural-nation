import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { seedTerrainGrid } from './terrain-seed';

const openDbs = new Set<Database.Database>();
const tempDirs: string[] = [];

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE terrain (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat_index INTEGER NOT NULL,
      lon_index INTEGER NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      elevation REAL NOT NULL,
      terrain_class TEXT NOT NULL
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
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe('seedTerrainGrid', () => {
  it('falls back to value-noise when no SRTM tiles are present', async () => {
    const db = createDb();
    const emptyDir = mkdtempSync(join(tmpdir(), 'no-tiles-'));
    tempDirs.push(emptyDir);
    const result = await seedTerrainGrid(db, undefined, emptyDir);
    expect(result.source).toBe('noise');
    expect(result.insertedCells).toBeGreaterThan(0);
    const count = db.prepare('SELECT COUNT(*) AS n FROM terrain').get() as { n: number };
    expect(count.n).toBe(result.insertedCells);
  });

  it('is idempotent (second run is a no-op)', async () => {
    const db = createDb();
    const emptyDir = mkdtempSync(join(tmpdir(), 'no-tiles-'));
    tempDirs.push(emptyDir);
    const first = await seedTerrainGrid(db, undefined, emptyDir);
    expect(first.insertedCells).toBeGreaterThan(0);
    const second = await seedTerrainGrid(db, undefined, emptyDir);
    expect(second.insertedCells).toBe(0);
  });
});
