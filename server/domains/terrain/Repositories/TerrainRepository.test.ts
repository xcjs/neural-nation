import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { schema } from '../../../db/schema';
import { TerrainRepository } from './TerrainRepository';

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
    CREATE TABLE terrain_modifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat_index INTEGER NOT NULL,
      lon_index INTEGER NOT NULL,
      elevation_delta REAL NOT NULL,
      new_terrain_class TEXT,
      modified_by TEXT NOT NULL,
      modified_at_tick INTEGER NOT NULL,
      operation_id TEXT NOT NULL,
      reason TEXT NOT NULL
    );
    CREATE TABLE meta (key TEXT PRIMARY KEY, tick_count INTEGER);
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

describe('terrainRepository.getTerrainCellNear', () => {
  it('returns the exact 0.25° cell for a coordinate', () => {
    const db = createDb();
    db.prepare(`INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(360, 720, 0, 0, 100, 'Plain');
    const repo = new TerrainRepository(drizzle(db, { schema }));
    const cell = repo.getTerrainCellNear(0.1, 0.1);
    expect(cell).toBeDefined();
    expect(cell!.latIndex).toBe(360);
    expect(cell!.lonIndex).toBe(720);
  });

  it('returns undefined when no cell matches the exact index', () => {
    const db = createDb();
    db.prepare(`INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(360, 720, 0, 0, 100, 'Plain');
    const repo = new TerrainRepository(drizzle(db, { schema }));
    expect(repo.getTerrainCellNear(45, 45)).toBeUndefined();
  });

  it('does not match a cell that is within 0.5° but in a different 0.25° cell', () => {
    const db = createDb();
    db.prepare(`INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(361, 721, 0.3, 0.3, 100, 'Plain');
    const repo = new TerrainRepository(drizzle(db, { schema }));
    expect(repo.getTerrainCellNear(0.1, 0.1)).toBeUndefined();
  });
});
