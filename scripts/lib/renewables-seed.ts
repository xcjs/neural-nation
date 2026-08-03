/**
 * Climate-distributed renewable resource deposits.
 *
 * Replaces the old null-lat/lon global renewables with geolocated deposit
 * rows so surveyRegion can find them and extractors can target them.
 *
 * Coordinates are drawn from real-world high-potential zones:
 *  - Solar: high-irradiance deserts (Sahara, Arabia, Australia, US SW, Atacama)
 *  - Wind: high-wind zones (North Sea, Patagonia, Great Plains, Gobi)
 *  - Hydro: major river basins (Amazon, Congo, Yangtze, etc.)
 *  - Wood/biomass: forested biomes (iterated from forest-density.json)
 *  - Water: major freshwater bodies
 *  - Arable land: temperate/tropical agricultural zones
 */

import type Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface RenewableSeedResult {
  insertedRows: number;
}

interface RenewableDeposit {
  resourceKey: string;
  name: string;
  lat: number;
  lon: number;
  quantity: number;
  unit: string;
}

/** High-irradiance solar zones (lat, lon, capacity MW). */
const SOLAR_ZONES: Array<{ lat: number; lon: number; capacity: number; name: string }> = [
  { lat: 23.0, lon: 12.0, capacity: 5e8, name: 'Sahara' },
  { lat: 24.5, lon: 45.0, capacity: 3e8, name: 'Arabia' },
  { lat: -25.0, lon: 135.0, capacity: 4e8, name: 'Australian Outback' },
  { lat: 35.0, lon: -115.0, capacity: 2e8, name: 'Mojave' },
  { lat: -23.0, lon: -68.0, capacity: 2e8, name: 'Atacama' },
  { lat: 28.0, lon: 35.0, capacity: 1.5e8, name: 'Eastern Sahara' },
  { lat: -20.0, lon: 25.0, capacity: 1.5e8, name: 'Kalahari' },
  { lat: 38.0, lon: -2.0, capacity: 8e7, name: 'Iberian Plateau' },
  { lat: 40.0, lon: 70.0, capacity: 1e8, name: 'Central Asia' },
  { lat: -30.0, lon: 20.0, capacity: 1e8, name: 'Namib' },
];

/** High-wind zones (lat, lon, capacity MW). */
const WIND_ZONES: Array<{ lat: number; lon: number; capacity: number; name: string }> = [
  { lat: 56.0, lon: 3.0, capacity: 2e8, name: 'North Sea' },
  { lat: -50.0, lon: -70.0, capacity: 2e8, name: 'Patagonia' },
  { lat: 42.0, lon: -100.0, capacity: 1.5e8, name: 'Great Plains' },
  { lat: 42.0, lon: 100.0, capacity: 1e8, name: 'Gobi' },
  { lat: -70.0, lon: 0.0, capacity: 1.5e8, name: 'Antarctica Coast' },
  { lat: 55.0, lon: 15.0, capacity: 1e8, name: 'Baltic' },
  { lat: 35.0, lon: 140.0, capacity: 8e7, name: 'Japan Coast' },
  { lat: 50.0, lon: -8.0, capacity: 1e8, name: 'Irish Sea' },
  { lat: 60.0, lon: -25.0, capacity: 1e8, name: 'Iceland Shelf' },
  { lat: 30.0, lon: 80.0, capacity: 8e7, name: 'Tibetan Plateau' },
];

/** Major river basins for hydro (lat, lon, capacity MW approximated from discharge). */
const HYDRO_ZONES: Array<{ lat: number; lon: number; capacity: number; name: string }> = [
  { lat: -3.0, lon: -60.0, capacity: 3e8, name: 'Amazon' },
  { lat: 0.0, lon: 18.0, capacity: 2e8, name: 'Congo' },
  { lat: 30.0, lon: 114.0, capacity: 2e8, name: 'Yangtze' },
  { lat: 38.0, lon: -90.0, capacity: 1.5e8, name: 'Mississippi' },
  { lat: 65.0, lon: 70.0, capacity: 1.5e8, name: 'Ob' },
  { lat: -25.0, lon: -55.0, capacity: 1e8, name: 'Paraná' },
  { lat: 70.0, lon: 100.0, capacity: 1.5e8, name: 'Yenisei' },
  { lat: 70.0, lon: 120.0, capacity: 1e8, name: 'Lena' },
  { lat: 18.0, lon: 105.0, capacity: 8e7, name: 'Mekong' },
  { lat: 25.0, lon: 85.0, capacity: 8e7, name: 'Ganges' },
  { lat: 30.0, lon: 31.0, capacity: 6e7, name: 'Nile' },
  { lat: 56.0, lon: 40.0, capacity: 6e7, name: 'Volga' },
  { lat: 48.0, lon: 20.0, capacity: 5e7, name: 'Danube' },
  { lat: 32.0, lon: 130.0, capacity: 5e7, name: 'Pearl' },
  { lat: 25.0, lon: 110.0, capacity: 5e7, name: 'Xi' },
  { lat: -8.0, lon: 115.0, capacity: 4e7, name: 'Volta' },
  { lat: 11.0, lon: 79.0, capacity: 4e7, name: 'Cauvery' },
  { lat: 45.0, lon: 100.0, capacity: 3e7, name: 'Selenga' },
  { lat: 60.0, lon: 70.0, capacity: 4e7, name: 'Irtysh' },
  { lat: 50.0, lon: 90.0, capacity: 3e7, name: 'Yenisei-Upper' },
];

/** Major freshwater lakes/rivers (lat, lon, volume in tonnes ≈ km³ × 1e9). */
const WATER_ZONES: Array<{ lat: number; lon: number; quantity: number; name: string }> = [
  { lat: 47.0, lon: -88.0, quantity: 1.2e13, name: 'Lake Superior' },
  { lat: 46.0, lon: -83.0, quantity: 4.9e12, name: 'Lake Huron' },
  { lat: 43.0, lon: -79.0, quantity: 1.6e12, name: 'Lake Ontario' },
  { lat: 42.0, lon: -80.0, quantity: 1.7e12, name: 'Lake Erie' },
  { lat: 46.0, lon: -87.0, quantity: 4.9e12, name: 'Lake Michigan' },
  { lat: 56.0, lon: 108.0, quantity: 2.4e13, name: 'Lake Baikal' },
  { lat: 1.0, lon: 33.0, quantity: 3.2e13, name: 'Lake Victoria' },
  { lat: 12.0, lon: 30.0, quantity: 2.5e13, name: 'White Nile' },
  { lat: -3.0, lon: -60.0, quantity: 7e12, name: 'Amazon River' },
  { lat: 30.0, lon: 114.0, quantity: 1e13, name: 'Yangtze River' },
  { lat: 11.0, lon: 79.0, quantity: 6e12, name: 'Ganges River' },
  { lat: 50.0, lon: 60.0, quantity: 8e12, name: 'Aral Sea' },
  { lat: 45.0, lon: 60.0, quantity: 1e13, name: 'Caspian Sea' },
  { lat: 42.0, lon: 88.0, quantity: 6e12, name: 'Lake Balkhash' },
  { lat: 14.0, lon: 105.0, quantity: 5e12, name: 'Tonlé Sap' },
  { lat: -9.0, lon: 115.0, quantity: 4e12, name: 'Lake Tanganyika' },
];

/**
 * Build the full list of renewable deposits (excluding wood/biomass which are
 * derived from forest-density.json in buildRenewableDeposits).
 */
function buildPointDeposits(): RenewableDeposit[] {
  const deposits: RenewableDeposit[] = [];

  for (const z of SOLAR_ZONES) {
    deposits.push({ resourceKey: 'solar', name: `Solar Energy - ${z.name}`, lat: z.lat, lon: z.lon, quantity: z.capacity, unit: 'MW' });
  }
  for (const z of WIND_ZONES) {
    deposits.push({ resourceKey: 'wind', name: `Wind Energy - ${z.name}`, lat: z.lat, lon: z.lon, quantity: z.capacity, unit: 'MW' });
  }
  for (const z of HYDRO_ZONES) {
    deposits.push({ resourceKey: 'hydro', name: `Hydro Power - ${z.name}`, lat: z.lat, lon: z.lon, quantity: z.capacity, unit: 'MW' });
  }
  for (const z of WATER_ZONES) {
    deposits.push({ resourceKey: 'water', name: `Water - ${z.name}`, lat: z.lat, lon: z.lon, quantity: z.quantity, unit: 't' });
  }
  return deposits;
}

/**
 * Seed renewable deposits with real lat/lon so surveyRegion can find them.
 *
 * Wood and biomass are derived from the Köppen-Geiger forest density grid
 * (`data/geological/forest-density.json`): cells with density above a
 * threshold emit wood + biomass deposits.
 *
 * Idempotent: no-ops if renewable deposits with non-null lat/lon already exist.
 */
export function seedRenewableDeposits(db: Database.Database, dataDir?: string): RenewableSeedResult {
  const result: RenewableSeedResult = { insertedRows: 0 };

  // Idempotency: skip if geolocated renewables already seeded
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM resources WHERE category = 'Renewable' AND lat IS NOT NULL`).get() as { n: number };
  if (existing.n > 0) {
    console.log(`Renewable deposits already seeded (${existing.n} rows), skipping.`);
    return result;
  }

  const insertStmt = db.prepare(`
    INSERT INTO resources (resource_key, name, category, lat, lon, quantity, remaining, grade, discovered, surface, depth, unit)
    VALUES (?, ?, 'Renewable', ?, ?, ?, ?, 1.0, 0, 1, NULL, ?)
  `);
  const insertMany = db.transaction((rows: RenewableDeposit[]) => {
    for (const r of rows) {
      insertStmt.run(r.resourceKey, r.name, r.lat, r.lon, r.quantity, r.quantity, r.unit);
    }
  });

  // 1. Point deposits (solar, wind, hydro, water)
  const pointDeposits = buildPointDeposits();
  insertMany(pointDeposits);
  result.insertedRows += pointDeposits.length;

  // 2. Arable land — temperate/tropical zones (approximate band latitudes)
  const arableZones: Array<{ lat: number; lon: number; quantity: number; name: string }> = [
    { lat: 40, lon: 0, quantity: 5e8, name: 'Mediterranean' },
    { lat: 42, lon: 14, quantity: 4e8, name: 'Italy' },
    { lat: 50, lon: 4, quantity: 4e8, name: 'France' },
    { lat: 52, lon: 13, quantity: 4e8, name: 'Germany' },
    { lat: 40, lon: -100, quantity: 6e8, name: 'US Midwest' },
    { lat: 35, lon: 115, quantity: 5e8, name: 'China North Plain' },
    { lat: 28, lon: 77, quantity: 5e8, name: 'India Gangetic' },
    { lat: -10, lon: -55, quantity: 4e8, name: 'Brazil Cerrado' },
    { lat: -25, lon: -60, quantity: 3e8, name: 'Argentina Pampas' },
    { lat: -34, lon: 142, quantity: 3e8, name: 'Murray-Darling' },
    { lat: 0, lon: 30, quantity: 3e8, name: 'Uganda' },
    { lat: 30, lon: 31, quantity: 3e8, name: 'Nile Delta' },
  ];
  const arableDeposits: RenewableDeposit[] = arableZones.map(z => ({
    resourceKey: 'arableland',
    name: `Arable Land - ${z.name}`,
    lat: z.lat,
    lon: z.lon,
    quantity: z.quantity,
    unit: 't',
  }));
  insertMany(arableDeposits);
  result.insertedRows += arableDeposits.length;

  // 3. Wood + biomass — iterate forest-density grid, emit deposits where dense
  const forestPath = resolve(dataDir ?? 'data/geological', 'forest-density.json');
  if (existsSync(forestPath)) {
    const forestRaw = JSON.parse(readFileSync(forestPath, 'utf-8')) as { width: number; height: number; data: number[] };
    const WOOD_THRESHOLD = 0.5;
    const woodDeposits: RenewableDeposit[] = [];
    const { width, height, data } = forestRaw;
    // Sample every Nth cell to avoid emitting thousands of tiny deposits
    const STEP = 8;
    for (let y = 0; y < height; y += STEP) {
      for (let x = 0; x < width; x += STEP) {
        const idx = y * width + x;
        const density = data[idx] ?? 0;
        if (density >= WOOD_THRESHOLD) {
          const lat = 90 - (y / height) * 180;
          const lon = (x / width) * 360 - 180;
          const qty = Math.round(density * 5e7);
          woodDeposits.push({
            resourceKey: 'wood',
            name: `Wood - ${lat.toFixed(1)},${lon.toFixed(1)}`,
            lat,
            lon,
            quantity: qty,
            unit: 't',
          });
          woodDeposits.push({
            resourceKey: 'biomass',
            name: `Biomass - ${lat.toFixed(1)},${lon.toFixed(1)}`,
            lat,
            lon,
            quantity: Math.round(qty * 0.5),
            unit: 't',
          });
        }
      }
    }
    if (woodDeposits.length > 0) {
      insertMany(woodDeposits);
      result.insertedRows += woodDeposits.length;
    }
  }
  else {
    // Fallback: a few major forest biomes with real coordinates
    const forestFallback: Array<{ lat: number; lon: number; quantity: number; name: string }> = [
      { lat: 0, lon: -60, quantity: 5e9, name: 'Amazon' },
      { lat: 0, lon: 20, quantity: 3e9, name: 'Congo Basin' },
      { lat: 60, lon: 100, quantity: 4e9, name: 'Siberian Taiga' },
      { lat: 50, lon: -90, quantity: 3e9, name: 'Canadian Boreal' },
      { lat: 5, lon: 110, quantity: 2e9, name: 'Borneo' },
      { lat: -10, lon: 145, quantity: 1.5e9, name: 'Queensland' },
    ];
    const woodFallback: RenewableDeposit[] = [];
    for (const f of forestFallback) {
      woodFallback.push({ resourceKey: 'wood', name: `Wood - ${f.name}`, lat: f.lat, lon: f.lon, quantity: f.quantity, unit: 't' });
      woodFallback.push({ resourceKey: 'biomass', name: `Biomass - ${f.name}`, lat: f.lat, lon: f.lon, quantity: Math.round(f.quantity * 0.5), unit: 't' });
    }
    insertMany(woodFallback);
    result.insertedRows += woodFallback.length;
  }

  return result;
}
