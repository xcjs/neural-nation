/**
 * Terrain seed module — generate a deterministic global terrain grid and
 * insert it into a game/template database.
 *
 * Uses value-noise (scripts/lib/value-noise.ts) rather than SRTM data so the
 * build is hermetic and reproducible. Grid resolution is configurable; the
 * default 1° grid produces ~65k cells.
 */
import type Database from 'better-sqlite3'
import { generateTerrainGrid, DEFAULT_TERRAIN_CONFIG, type TerrainGridConfig, type TerrainCell } from './value-noise'

export interface TerrainSeedResult {
  insertedCells: number
  resolution: number
}

/**
 * Generate and insert terrain cells into the `terrain` table.
 *
 * Idempotent: if the `terrain` table already contains rows, this is a no-op.
 */
export function seedTerrainGrid(
  db: Database.Database,
  config: TerrainGridConfig = DEFAULT_TERRAIN_CONFIG,
): TerrainSeedResult {
  const result: TerrainSeedResult = {
    insertedCells: 0,
    resolution: config.resolution,
  }

  // Idempotency: check if terrain already seeded
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM terrain`).get() as { n: number }
  if (existing.n > 0) {
    console.log(`Terrain grid already seeded (${existing.n} cells), skipping.`)
    return result
  }

  const cells = generateTerrainGrid(config)

  const insertStmt = db.prepare(`
    INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const insertMany = db.transaction((rows: TerrainCell[]) => {
    for (const c of rows) {
      insertStmt.run(c.latIndex, c.lonIndex, c.lat, c.lon, c.elevation, c.terrainClass)
    }
  })

  // Batch in chunks of 5000
  const BATCH_SIZE = 5000
  for (let i = 0; i < cells.length; i += BATCH_SIZE) {
    const batch = cells.slice(i, i + BATCH_SIZE)
    insertMany(batch)
    result.insertedCells += batch.length
  }

  return result
}