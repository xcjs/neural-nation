import type Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERRAIN_LAT_CELLS, TERRAIN_LON_CELLS } from '../lib/constants/terrain';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const OUTPUT_PATH = join(root, 'public', 'data', 'geological', 'terrain-heightmap.json');

export interface TerrainHeightmapResult {
  width: number;
  height: number;
  cells: number;
  data: number[];
  outputPath: string;
}

export function buildTerrainHeightmap(db: Database.Database): TerrainHeightmapResult {
  const width = TERRAIN_LON_CELLS;
  const height = TERRAIN_LAT_CELLS;
  const data = Array.from<number>({ length: width * height }).fill(0);
  const rows = db.prepare(`SELECT lat_index, lon_index, elevation FROM terrain`).all() as Array<{ lat_index: number; lon_index: number; elevation: number }>;
  for (const r of rows) {
    data[r.lat_index * width + r.lon_index] = r.elevation;
  }
  return { width, height, cells: rows.length, data, outputPath: OUTPUT_PATH };
}

export function writeTerrainHeightmap(result: TerrainHeightmapResult): void {
  mkdirSync(dirname(result.outputPath), { recursive: true });
  writeFileSync(result.outputPath, JSON.stringify(result), 'utf-8');
}
