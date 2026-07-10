/**
 * Standalone MRDS deposits seeding script.
 * Parses the USGS MRDS CSV zip and inserts real resource deposits into the
 * template DB. Idempotent — no-ops if resources already seeded or zip missing.
 *
 * Usage: npm run db:seed-deposits
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const templatePath = join(root, 'data', 'games', '_template.db')
const mrdsZipPath = join(root, 'data', 'geological', 'raw', 'mrds.csv.zip')

async function main() {
  if (!existsSync(templatePath)) {
    console.error(`Template DB not found at ${templatePath}. Run 'npm run build:template' first.`)
    process.exit(1)
  }

  if (!existsSync(mrdsZipPath)) {
    console.error(`MRDS zip not found at ${mrdsZipPath}. Run 'npm run fetch:data' first.`)
    process.exit(1)
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(templatePath)
  db.pragma('foreign_keys = ON')

  const { seedMrdsDeposits } = await import('./lib/mrds-seed')
  const result = seedMrdsDeposits(db, mrdsZipPath)
  console.log(`MRDS: ${result.insertedRows} deposits inserted (${result.skippedRows} skipped, ${result.totalRows} total rows)`)
  if (result.unmappedCommodities.size > 0) {
    console.log(`Unmapped commodities: ${[...result.unmappedCommodities].sort().join(', ')}`)
  }

  db.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
