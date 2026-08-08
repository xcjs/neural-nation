import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTerrainHeightmap } from './build-terrain-texture';

const openDbs = new Set<Database.Database>();

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
});

describe('buildTerrainHeightmap', () => {
  it('produces a row-major elevation array with correct dimensions', () => {
    const db = createDb();
    db.prepare(`INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(0, 0, -90, -180, -1000, 'Ocean');
    db.prepare(`INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(360, 720, 0, 0, 100, 'Plain');

    const result = buildTerrainHeightmap(db);
    expect(result.width).toBe(1440);
    expect(result.height).toBe(720);
    expect(result.cells).toBe(2);
    expect(result.data.length).toBe(720 * 1440);
    // Row-major: index = latIndex * 1440 + lonIndex
    expect(result.data[0]).toBe(-1000);
    expect(result.data[360 * 1440 + 720]).toBe(100);
  });
});
