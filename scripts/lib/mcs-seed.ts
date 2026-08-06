/**
 * MCS (Mineral Commodity Summaries) global production scaling.
 *
 * Rather than country-level polygon distribution, this module scales each
 * MRDS deposit's tonnage so the global total per commodity matches real-world
 * annual production figures (from USGS MCS) multiplied by a reserve factor.
 *
 * This gives deposits realistic real-world tonnage scale without requiring
 * country-bounds polygon data.
 */

import type Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { parseCsvString } from './csv-parser';
import { resolveProfile } from './deposit-profiles';

/**
 * Embedded global annual production figures (tonnes/year) from USGS Mineral
 * Commodity Summaries. Used as the fallback when no external MCS CSV is
 * available. Sourced from public USGS MCS data.
 */
export const GLOBAL_PRODUCTION: Record<string, number> = {
  'Copper': 22e6,
  'Iron': 3e9,
  'Gold': 3500,
  'Silver': 25e3,
  'Lead': 4.5e6,
  'Zinc': 13e6,
  'Nickel': 3.3e6,
  'Aluminum': 69e6,
  'Uranium': 60e3,
  'Coal': 8e9,
  'Tin': 300e3,
  'Molybdenum': 250e3,
  'Phosphorus': 220e6,
  'Rare Earths': 300e3,
  'REE': 300e3,
  'Manganese': 20e6,
  'Antimony': 80e3,
  'Tungsten': 80e3,
  'Platinum': 180e3,
  'Chromium': 40e6,
  'Cobalt': 170e3,
  'Lithium': 130e3,
  'Graphite': 1.3e6,
  'Silicon': 8e6,
  'Silica': 8e6,
  'Quartz': 8e6,
  'Titanium': 9e6,
  'Vanadium': 100e3,
  'Beryllium': 250,
  'Barium': 9e6,
  'Fluorine': 7e6,
  'Gypsum': 150e6,
  'Limestone': 400e6,
};

/** Reserve factor: economic reserves ≈ annual production × this multiplier. */
const RESERVE_FACTOR = 100;

export interface McsSeedResult {
  commoditiesAdjusted: number;
  totalDepositsAdjusted: number;
}

/**
 * Scale MRDS deposit tonnage to match real-world global production.
 *
 * For each commodity, sums the current deposit tonnages, then scales each
 * deposit so the total matches `annualProduction × RESERVE_FACTOR`. Deposits
 * keep their proportional share of the total.
 *
 * If an external MCS CSV is present at `csvPath`, it's parsed for
 * `Commodity,Production` rows; otherwise the embedded `GLOBAL_PRODUCTION`
 * table is used.
 *
 * Idempotent: no-ops if the `resources.mcsAdjusted` column is 1 on all rows.
 */
export function seedMcsProduction(
  db: Database.Database,
  csvPath?: string,
): McsSeedResult {
  const result: McsSeedResult = { commoditiesAdjusted: 0, totalDepositsAdjusted: 0 };

  // Ensure mcsAdjusted column exists (idempotent ALTER)
  try {
    db.exec('ALTER TABLE resources ADD COLUMN mcsAdjusted INTEGER DEFAULT 0');
  }
  catch {
    // Column already exists
  }

  // Idempotency: skip if already adjusted (exclude renewables which have no MCS profile)
  const pending = db.prepare('SELECT COUNT(*) AS n FROM resources WHERE lat IS NOT NULL AND mcsAdjusted = 0 AND category != ?').get('Renewable') as { n: number };
  if (pending.n === 0) {
    console.log('MCS production scaling already applied, skipping.');
    return result;
  }

  // Load production table: commodity → annual tonnes
  const production = new Map<string, number>();
  if (csvPath && existsSync(csvPath)) {
    const content = readFileSync(csvPath, 'utf-8');
    for (const row of parseCsvString(content)) {
      const commodity = (row.Commodity ?? row.commodity ?? '').trim();
      const prodStr = row.Production ?? row.production ?? row.AnnualProduction ?? '';
      const prod = Number.parseFloat(prodStr);
      if (commodity && Number.isFinite(prod) && prod > 0)
        production.set(commodity, prod);
    }
  }
  // Merge embedded defaults (CSV overrides)
  for (const [k, v] of Object.entries(GLOBAL_PRODUCTION)) {
    if (!production.has(k))
      production.set(k, v);
  }

  // Group deposit resource_keys by their source commodity token so we can
  // scale them. We map commodity token → resourceKey via the deposit profile
  // resolver (which shares the same token space as COMMODITY_MAP head names).
  // Since mrds-seed already stored resourceKey, we work per-resourceKey.
  // Build resourceKey → production figure by resolving the commodity profile.
  const resourceKeyToProduction = new Map<string, number>();
  for (const [commodity, prod] of production) {
    const profile = resolveProfile(commodity);
    if (!profile)
      continue;
    // Map commodity token → resourceKey using the same head-match logic as
    // mrds-seed's resolveCommodity. We approximate by lowercasing the head
    // and checking against known element symbols / non-element keys.
    // Simpler: query the DB for distinct resource_keys and match by profile.
    resourceKeyToProduction.set(commodity, prod);
  }

  // For each commodity with production data, find deposits and scale them.
  // We match by the commodity token stored during MRDS seeding. Since we
  // don't store the original commodity token, we match by resourceKey using
  // a commodity→resourceKey map derived from the profile table.
  // Build a reverse map: commodity → resourceKey via COMMODITY_MAP head match.
  const { COMMODITY_KEYS } = buildCommodityKeyMap();

  for (const [commodity, annualProd] of production) {
    const resourceKeys = COMMODITY_KEYS.get(commodity);
    if (!resourceKeys || resourceKeys.length === 0)
      continue;

    const targetTotal = annualProd * RESERVE_FACTOR;

    for (const resourceKey of resourceKeys) {
      const rows = db.prepare(
        `SELECT id, quantity FROM resources WHERE resource_key = ? AND lat IS NOT NULL AND mcsAdjusted = 0`,
      ).all(resourceKey) as Array<{ id: number; quantity: number }>;

      if (rows.length === 0)
        continue;

      const currentTotal = rows.reduce((sum, r) => sum + r.quantity, 0);
      if (currentTotal <= 0)
        continue;

      const scale = targetTotal / currentTotal;
      const updateStmt = db.prepare(
        `UPDATE resources SET quantity = ROUND(quantity * ?), remaining = ROUND(remaining * ?), mcsAdjusted = 1 WHERE id = ?`,
      );
      const updateMany = db.transaction((ids: Array<{ id: number }>) => {
        for (const r of ids) {
          updateStmt.run(scale, scale, r.id);
        }
      });
      updateMany(rows);
      result.commoditiesAdjusted++;
      result.totalDepositsAdjusted += rows.length;
    }
  }

  // Mark any remaining unadjusted non-renewable deposits as adjusted=1 so re-runs are no-ops.
  db.prepare(`UPDATE resources SET mcsAdjusted = 1 WHERE lat IS NOT NULL AND mcsAdjusted = 0 AND category != ?`).run('Renewable');

  return result;
}

/** Commodity token → array of resourceKeys it maps to (from COMMODITY_MAP). */
function buildCommodityKeyMap(): { COMMODITY_KEYS: Map<string, string[]> } {
  // Re-declare the head-match commodity → resourceKey mapping inline.
  // This mirrors mrds-seed's COMMODITY_MAP but grouped by the commodity token
  // that production data uses (e.g. "Copper" → ["cu"]).
  const COMMODITY_KEYS = new Map<string, string[]>();
  const map: Record<string, string[]> = {
    'Copper': ['cu'],
    'Iron': ['fe'],
    'Gold': ['au'],
    'Silver': ['ag'],
    'Lead': ['pb'],
    'Zinc': ['zn'],
    'Nickel': ['ni'],
    'Aluminum': ['al'],
    'Uranium': ['u'],
    'Coal': ['coal'],
    'Tin': ['sn'],
    'Molybdenum': ['mo'],
    'Phosphorus': ['p'],
    'Rare Earths': ['ree'],
    'REE': ['ree'],
    'Manganese': ['mn'],
    'Antimony': ['sb'],
    'Tungsten': ['w'],
    'Platinum': ['pt'],
    'Chromium': ['cr'],
    'Cobalt': ['co'],
    'Lithium': ['li'],
    'Graphite': ['graphite'],
    'Silicon': ['si'],
    'Silica': ['si'],
    'Quartz': ['si'],
    'Titanium': ['ti'],
    'Vanadium': ['v'],
    'Beryllium': ['be'],
    'Barium': ['ba'],
    'Fluorine': ['f'],
    'Gypsum': ['gypsum'],
    'Limestone': ['limestone'],
  };
  for (const [k, v] of Object.entries(map))
    COMMODITY_KEYS.set(k, v);
  return { COMMODITY_KEYS };
}
