/**
 * Standalone terrain seeding script.
 * Seeds the deterministic value-noise terrain grid into the template DB.
 * Idempotent — no-ops if terrain already populated.
 *
 * Usage: npm run db:seed-terrain
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const templatePath = join(root, 'data', 'games', '_template.db')

async function main() {
  if (!existsSync(templatePath)) {
    console.error(`Template DB not found at ${templatePath}. Run 'npm run build:template' first.`)
    process.exit(1)
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(templatePath)
  db.pragma('foreign_keys = ON')

  const { seedTerrainGrid } = await import('./lib/terrain-seed')
  const result = seedTerrainGrid(db)
  console.log(`Terrain: ${result.insertedCells} cells @ ${result.resolution}° resolution`)

  db.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})