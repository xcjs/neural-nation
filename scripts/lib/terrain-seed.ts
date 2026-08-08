import type Database from 'better-sqlite3';
import { existsSync, readdirSync } from 'node:fs';
import { generateTerrainFromSrtm } from './srtm-seed';
import { DEFAULT_TERRAIN_CONFIG, generateTerrainGrid, type TerrainCell, type TerrainGridConfig } from './value-noise';

export interface TerrainSeedResult {
  insertedCells: number;
  resolution: number;
  source: 'srtm' | 'noise';
}

function hasSrtmTiles(tilesDir: string): boolean {
  if (!existsSync(tilesDir))
    return false;
  return readdirSync(tilesDir).some(f => /^srtm_-?\d+_-?\d+\.tif$/.test(f));
}

export async function seedTerrainGrid(
  db: Database.Database,
  config: TerrainGridConfig = DEFAULT_TERRAIN_CONFIG,
  tilesDir?: string,
): Promise<TerrainSeedResult> {
  const result: TerrainSeedResult = {
    insertedCells: 0,
    resolution: config.resolution,
    source: 'noise',
  };

  const existing = db.prepare(`SELECT COUNT(*) AS n FROM terrain`).get() as { n: number };
  if (existing.n > 0) {
    console.log(`Terrain grid already seeded (${existing.n} cells), skipping.`);
    return result;
  }

  let cells: TerrainCell[];
  if (tilesDir && hasSrtmTiles(tilesDir)) {
    cells = await generateTerrainFromSrtm(tilesDir, config);
    result.source = 'srtm';
  }
  else {
    console.warn('SRTM tiles not found — falling back to value-noise terrain. Run `npm run fetch:data` to download real elevation data.');
    cells = generateTerrainGrid(config);
    result.source = 'noise';
  }

  const insertStmt = db.prepare(`
    INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows: TerrainCell[]) => {
    for (const c of rows) {
      insertStmt.run(c.latIndex, c.lonIndex, c.lat, c.lon, c.elevation, c.terrainClass);
    }
  });

  const BATCH_SIZE = 5000;
  for (let i = 0; i < cells.length; i += BATCH_SIZE) {
    const batch = cells.slice(i, i + BATCH_SIZE);
    insertMany(batch);
    result.insertedCells += batch.length;
  }

  return result;
}
