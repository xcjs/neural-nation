/**
 * MRDS seed module — parse the USGS MRDS CSV and insert resource deposits
 * into a game/template database.
 *
 * Commodity tokens from MRDS `commod1` are mapped to our `resource_key`
 * format (lowercase element symbol for elements, camelCase for non-element
 * resources). Rows with no mappable commodity are skipped.
 *
 * Deposit size is scaled inversely by crustal abundance: rarer elements get
 * smaller deposits. Surface vs. underground is inferred from the `work_type`
 * and `dev_stat` fields where possible, else defaults to underground (surface=0).
 */
import type Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { ELEMENTS } from '../../lib/constants/elements'
import { parseCsvString } from './csv-parser'
import { readZipEntryAsString } from './zip'

/** Path to the downloaded MRDS zip (relative to repo root). */
export const MRDS_ZIP_PATH = 'data/geological/raw/mrds.csv.zip'
export const MRDS_ENTRY_NAME = 'mrds.csv'

/**
 * Commodity token → resourceKey map.
 * Element symbols are lowercased. Non-element resources use camelCase.
 */
const COMMODITY_MAP: Record<string, string> = {
  'Aluminum': 'al',
  'Antimony': 'sb',
  'Arsenic': 'as',
  'Barium': 'ba',
  'Beryllium': 'be',
  'Boron': 'b',
  'Cadmium': 'cd',
  'Calcium': 'ca',
  'Cerium': 'ce',
  'Cesium': 'cs',
  'Chromium': 'cr',
  'Cobalt': 'co',
  'Copper': 'cu',
  'Fluorine': 'f',
  'Gallium': 'ga',
  'Germanium': 'ge',
  'Gold': 'au',
  'Hafnium': 'hf',
  'Helium': 'he',
  'Indium': 'in',
  'Iodine': 'i',
  'Iridium': 'ir',
  'Iron': 'fe',
  'Lead': 'pb',
  'Lithium': 'li',
  'Magnesium': 'mg',
  'Manganese': 'mn',
  'Mercury': 'hg',
  'Molybdenum': 'mo',
  'Nickel': 'ni',
  'Osmium': 'os',
  'Palladium': 'pd',
  'Platinum': 'pt',
  'Potassium': 'k',
  'Radium': 'ra',
  'Rhenium': 're',
  'Rhodium': 'rh',
  'Rubidium': 'rb',
  'Ruthenium': 'ru',
  'Scandium': 'sc',
  'Selenium': 'se',
  'Silver': 'ag',
  'Sodium': 'na',
  'Strontium': 'sr',
  'Sulfur': 's',
  'Tantalum': 'ta',
  'Tellurium': 'te',
  'Thallium': 'tl',
  'Thorium': 'th',
  'Tin': 'sn',
  'Titanium': 'ti',
  'Tungsten': 'w',
  'Uranium': 'u',
  'Vanadium': 'v',
  'Zinc': 'zn',
  'Zirconium': 'zr',
  'Phosphorus': 'p',
  'Nitrogen': 'n',
  // Non-element mappable resources
  'Coal': 'Coal',
  'Anthracite': 'Coal',
  'Bituminous': 'Coal',
  'Subbituminous': 'Coal',
  'Lignite': 'Coal',
  'Natural Gas': 'NaturalGas',
  'Petroleum (Oil)': 'Oil',
  'Oil Shale': 'Oil',
  'Oil Sands': 'Oil',
  'Peat': 'Peat',
  'Geothermal': 'Geothermal',
  'Stone': 'Stone',
  'Sand': 'Sand',
  'Gravel': 'Gravel',
  'Clay': 'Clay',
  'Limestone': 'Limestone',
  'Gypsum': 'Gypsum',
  'Salt': 'Salt',
  'Quartz': 'Quartz',
  'Mica': 'Mica',
  'Asbestos': 'Asbestos',
  'Talc': 'Talc',
  'Graphite': 'Graphite',
  'Diamond': 'Diamond',
  'Gemstone': 'Gemstone',
}

/** Build a lookup from element symbol (lowercase) → crustalAbundance. */
const ABUNDANCE_BY_KEY: Record<string, number> = {}
for (const el of ELEMENTS) {
  ABUNDANCE_BY_KEY[el.symbol.toLowerCase()] = el.crustalAbundance
}

/** Resolve a single commodity token to a resourceKey, or null if unmappable. */
function resolveCommodity(token: string): string | null {
  const clean = token.trim()
  if (!clean)
    return null
  // Direct match
  if (COMMODITY_MAP[clean])
    return COMMODITY_MAP[clean]
  // Try prefix match for hyphenated forms (e.g. "Fluorine-Fluorite" → "Fluorine")
  const head = clean.split('-')[0]!.trim()
  if (COMMODITY_MAP[head])
    return COMMODITY_MAP[head]
  // Try "X Oxide"/"X Sulfide" → element X
  const oxideMatch = clean.match(/^(\w+)\s+Oxide$/i)
  if (oxideMatch && oxideMatch[1] && COMMODITY_MAP[oxideMatch[1]])
    return COMMODITY_MAP[oxideMatch[1]] ?? null
  const sulfideMatch = clean.match(/^(\w+)\s+Sulfide$/i)
  if (sulfideMatch && sulfideMatch[1] && COMMODITY_MAP[sulfideMatch[1]])
    return COMMODITY_MAP[sulfideMatch[1]] ?? null
  return null
}

/** Compute a synthetic deposit quantity (in tonnes) from crustal abundance. */
function scaleDepositSize(abundance: number): number {
  // High-abundance elements (e.g. Fe, Al, Si) → large deposits (1e6–1e8 t)
  // Low-abundance (e.g. Au, Pt) → small deposits (1e2–1e4 t)
  if (abundance <= 0)
    return 1e4
  // log-scale: abundance 1 → ~1e5, abundance 1e5 → ~1e7
  const base = 1e5 * 10 ** (Math.log10(Math.max(abundance, 1)) / 2)
  // Add deterministic variation via Math.random is not deterministic; use a fixed spread.
  return Math.round(base)
}

/** Grade (fraction 0..1) — heuristic from crustal abundance. */
function heuristicGrade(abundance: number): number {
  // Rarer elements tend to be mined at lower grades
  if (abundance <= 0)
    return 0.001
  const g = 0.01 / Math.max(1, Math.log10(abundance))
  return Math.min(0.5, Math.max(0.0001, g))
}

export interface MrdsSeedOptions {
  /** Max number of deposit rows to insert (default: all mappable). */
  maxRows?: number
  /** Skip rows whose latitude/longitude can't be parsed. */
  skipInvalidCoords?: boolean
}

export interface MrdsSeedResult {
  totalRows: number
  insertedRows: number
  skippedRows: number
  unmappedCommodities: Set<string>
}

/**
 * Parse the MRDS zip and insert resource deposits into the given db.
 *
 * Idempotent: if the `resources` table already contains rows with non-null
 * lat/lon (i.e. real deposits), this is a no-op.
 */
export function seedMrdsDeposits(
  db: Database.Database,
  zipPath: string = MRDS_ZIP_PATH,
  options: MrdsSeedOptions = {},
): MrdsSeedResult {
  const result: MrdsSeedResult = {
    totalRows: 0,
    insertedRows: 0,
    skippedRows: 0,
    unmappedCommodities: new Set(),
  }

  // Idempotency: check if real deposits already seeded
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM resources WHERE lat IS NOT NULL AND lon IS NOT NULL AND remaining > 0`).get() as { n: number }
  if (existing.n > 0) {
    console.log(`MRDS deposits already seeded (${existing.n} rows), skipping.`)
    return result
  }

  if (!existsSync(zipPath)) {
    console.warn(`MRDS zip not found at ${zipPath}. Run fetch:data first.`)
    return result
  }

  const content = readZipEntryAsString(zipPath, MRDS_ENTRY_NAME)
  if (!content) {
    console.warn(`Could not read ${MRDS_ENTRY_NAME} from ${zipPath}.`)
    return result
  }

  const insertStmt = db.prepare(`
    INSERT INTO resources (resource_key, name, category, lat, lon, quantity, remaining, grade, discovered, surface, depth, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 't')
  `)

  const insertMany = db.transaction((rows: Array<[string, string, string, number, number, number, number, number, number, number | null]>) => {
    for (const r of rows) {
      insertStmt.run(...r)
    }
  })

  const batch: Array<[string, string, string, number, number, number, number, number, number, number | null]> = []
  const BATCH_SIZE = 5000
  let maxRows = options.maxRows ?? Infinity

  for (const row of parseCsvString(content)) {
    result.totalRows++

    if (maxRows <= 0)
      break

    const latStr = row.latitude
    const lonStr = row.longitude
    const lat = Number.parseFloat(latStr ?? '')
    const lon = Number.parseFloat(lonStr ?? '')

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      if (!options.skipInvalidCoords)
        result.skippedRows++
      continue
    }

    const commodStr = row.commod1 ?? ''
    const tokens = commodStr.split(',').map(t => t.trim()).filter(Boolean)
    if (tokens.length === 0) {
      result.skippedRows++
      continue
    }

    // Map all commodities; pick the first mappable one as the primary resourceKey.
    // (A single MRDS record represents one deposit site; we model it as one row.)
    let resourceKey: string | null = null
    for (const token of tokens) {
      const mapped = resolveCommodity(token)
      if (mapped) {
        resourceKey = mapped
        break
      }
      else {
        result.unmappedCommodities.add(token)
      }
    }
    if (!resourceKey) {
      result.skippedRows++
      continue
    }

    // Determine category
    const isElement = /^[a-z]{1,2}$/.test(resourceKey)
    const category = isElement ? 'Element' : 'NonRenewable'

    // Determine name
    let name = resourceKey
    if (isElement) {
      const el = ELEMENTS.find(e => e.symbol.toLowerCase() === resourceKey)
      name = el?.name ?? resourceKey
    }

    // Scale size & grade from abundance
    const abundance = isElement ? (ABUNDANCE_BY_KEY[resourceKey] ?? 1) : 1000
    const quantity = scaleDepositSize(abundance)
    const grade = heuristicGrade(abundance)

    // Surface/depth heuristic from work_type/dev_stat
    const workType = (row.work_type ?? '').toLowerCase()
    const surface = workType.includes('surface') || workType.includes('open') || workType.includes('placer') ? 1 : 0
    // Deterministic pseudo-random depth from coordinates
    const depthSeed = Math.abs(Math.round((lat * 1000) + (lon * 10000))) % 500
    const depth = surface ? 0 : 50 + depthSeed

    batch.push([resourceKey, name, category, lat, lon, quantity, quantity, grade, surface, depth])

    if (batch.length >= BATCH_SIZE) {
      insertMany(batch)
      result.insertedRows += batch.length
      maxRows -= batch.length
      batch.length = 0
    }
  }

  if (batch.length > 0 && maxRows > 0) {
    insertMany(batch)
    result.insertedRows += batch.length
  }

  return result
}
