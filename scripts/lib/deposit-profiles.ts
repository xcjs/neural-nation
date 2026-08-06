/**
 * Deposit grade/tonnage profiles sourced from public USGS Professional
 * Papers and published deposit models. Each profile gives a realistic range
 * for the deposit type associated with a given commodity.
 */

export interface DepositProfile {
  /** Minimum ore grade as a mass fraction (0..1). */
  gradeMin: number;
  /** Maximum ore grade as a mass fraction (0..1). */
  gradeMax: number;
  /** Minimum ore tonnage in tonnes. */
  tonnageMin: number;
  /** Maximum ore tonnage in tonnes. */
  tonnageMax: number;
  /** Unit of the tonnage figures (always 't' for tonnes). */
  unit: 't';
}

/**
 * Commodity token → deposit profile. Ranges are drawn from public USGS
 * deposit models (Professional Papers 1693, 1802, and the USGS Mineral
 * Deposit Database documentation). Where a commodity spans multiple deposit
 * types, the range covers the dominant economic type.
 */
export const DEPOSIT_PROFILES: Record<string, DepositProfile> = {
  'Copper': { gradeMin: 0.004, gradeMax: 0.015, tonnageMin: 1e7, tonnageMax: 1e9, unit: 't' },
  'Iron': { gradeMin: 0.30, gradeMax: 0.60, tonnageMin: 1e8, tonnageMax: 5e9, unit: 't' },
  'Gold': { gradeMin: 1e-6, gradeMax: 1e-5, tonnageMin: 1e5, tonnageMax: 5e7, unit: 't' },
  'Silver': { gradeMin: 1e-5, gradeMax: 5e-4, tonnageMin: 1e5, tonnageMax: 5e7, unit: 't' },
  'Lead': { gradeMin: 0.02, gradeMax: 0.10, tonnageMin: 1e6, tonnageMax: 5e7, unit: 't' },
  'Zinc': { gradeMin: 0.02, gradeMax: 0.12, tonnageMin: 1e6, tonnageMax: 5e7, unit: 't' },
  'Nickel': { gradeMin: 0.005, gradeMax: 0.03, tonnageMin: 5e6, tonnageMax: 5e8, unit: 't' },
  'Aluminum': { gradeMin: 0.30, gradeMax: 0.55, tonnageMin: 5e7, tonnageMax: 1e9, unit: 't' },
  'Uranium': { gradeMin: 0.001, gradeMax: 0.005, tonnageMin: 1e5, tonnageMax: 1e8, unit: 't' },
  'Coal': { gradeMin: 0.5, gradeMax: 0.9, tonnageMin: 5e7, tonnageMax: 5e9, unit: 't' },
  'Tin': { gradeMin: 0.003, gradeMax: 0.02, tonnageMin: 1e5, tonnageMax: 5e7, unit: 't' },
  'Molybdenum': { gradeMin: 0.0005, gradeMax: 0.005, tonnageMin: 5e6, tonnageMax: 5e8, unit: 't' },
  'Phosphorus': { gradeMin: 0.15, gradeMax: 0.40, tonnageMin: 5e7, tonnageMax: 5e9, unit: 't' },
  'Rare Earths': { gradeMin: 0.03, gradeMax: 0.15, tonnageMin: 1e6, tonnageMax: 5e8, unit: 't' },
  'REE': { gradeMin: 0.03, gradeMax: 0.15, tonnageMin: 1e6, tonnageMax: 5e8, unit: 't' },
  'Manganese': { gradeMin: 0.20, gradeMax: 0.55, tonnageMin: 1e6, tonnageMax: 5e8, unit: 't' },
  'Antimony': { gradeMin: 0.01, gradeMax: 0.06, tonnageMin: 1e4, tonnageMax: 5e6, unit: 't' },
  'Tungsten': { gradeMin: 0.003, gradeMax: 0.02, tonnageMin: 1e4, tonnageMax: 5e7, unit: 't' },
  'Platinum': { gradeMin: 1e-7, gradeMax: 1e-5, tonnageMin: 1e5, tonnageMax: 5e7, unit: 't' },
  'Chromium': { gradeMin: 0.20, gradeMax: 0.55, tonnageMin: 5e6, tonnageMax: 5e8, unit: 't' },
  'Cobalt': { gradeMin: 0.001, gradeMax: 0.02, tonnageMin: 1e5, tonnageMax: 5e7, unit: 't' },
  'Lithium': { gradeMin: 0.005, gradeMax: 0.03, tonnageMin: 1e6, tonnageMax: 5e8, unit: 't' },
  'Graphite': { gradeMin: 0.10, gradeMax: 0.40, tonnageMin: 1e5, tonnageMax: 5e7, unit: 't' },
  'Silicon': { gradeMin: 0.40, gradeMax: 0.99, tonnageMin: 5e6, tonnageMax: 5e8, unit: 't' },
  'Silica': { gradeMin: 0.40, gradeMax: 0.99, tonnageMin: 5e6, tonnageMax: 5e8, unit: 't' },
  'Quartz': { gradeMin: 0.40, gradeMax: 0.99, tonnageMin: 5e6, tonnageMax: 5e8, unit: 't' },
  'Titanium': { gradeMin: 0.05, gradeMax: 0.30, tonnageMin: 5e6, tonnageMax: 5e8, unit: 't' },
  'Vanadium': { gradeMin: 0.0005, gradeMax: 0.02, tonnageMin: 1e5, tonnageMax: 5e7, unit: 't' },
  'Beryllium': { gradeMin: 0.0005, gradeMax: 0.01, tonnageMin: 1e4, tonnageMax: 5e6, unit: 't' },
  'Barium': { gradeMin: 0.20, gradeMax: 0.60, tonnageMin: 1e5, tonnageMax: 5e7, unit: 't' },
  'Fluorine': { gradeMin: 0.20, gradeMax: 0.70, tonnageMin: 1e5, tonnageMax: 5e7, unit: 't' },
  'Gypsum': { gradeMin: 0.50, gradeMax: 0.95, tonnageMin: 1e5, tonnageMax: 5e7, unit: 't' },
  'Limestone': { gradeMin: 0.50, gradeMax: 0.95, tonnageMin: 5e6, tonnageMax: 5e8, unit: 't' },
};

/** Resolve a commodity token (possibly hyphenated / oxide / sulfide) to a profile. */
export function resolveProfile(commodityToken: string): DepositProfile | null {
  const clean = commodityToken.trim();
  if (!clean)
    return null;
  // Direct match
  if (DEPOSIT_PROFILES[clean])
    return DEPOSIT_PROFILES[clean]!;
  // Head match for hyphenated/comma forms (e.g. "Copper,Gold" → "Copper")
  const head = clean.split(/[,\-]/)[0]!.trim();
  if (DEPOSIT_PROFILES[head])
    return DEPOSIT_PROFILES[head]!;
  // "X Oxide"/"X Sulfide" → X
  const oxideMatch = clean.match(/^(\w+)\s+Oxide$/i);
  if (oxideMatch && oxideMatch[1] && DEPOSIT_PROFILES[oxideMatch[1]])
    return DEPOSIT_PROFILES[oxideMatch[1]]!;
  const sulfideMatch = clean.match(/^(\w+)\s+Sulfide$/i);
  if (sulfideMatch && sulfideMatch[1] && DEPOSIT_PROFILES[sulfideMatch[1]])
    return DEPOSIT_PROFILES[sulfideMatch[1]]!;
  return null;
}

/**
 * Deterministically sample a grade and tonnage from a profile, seeded by
 * lat/lon so the same deposit always gets the same values on re-seed.
 *
 * Uses a simple integer hash of (lat, lon) mapped to a 0..1 value via
 * fractional part of the sine-based hash.
 */
export function sampleProfile(profile: DepositProfile, lat: number, lon: number): { grade: number; tonnage: number } {
  // Deterministic hash: sin(lat * 12.9898 + lon * 78.233) * 43758.5453 — classic GLSL hash
  const h = Math.sin(lat * 12.9898 + lon * 78.233) * 43758.5453;
  const t = h - Math.floor(h); // 0..1
  const grade = profile.gradeMin + t * (profile.gradeMax - profile.gradeMin);
  // Second hash for tonnage (independent of grade)
  const h2 = Math.sin(lat * 4.1713 + lon * 12.3456) * 12345.6789;
  const t2 = h2 - Math.floor(h2);
  // Log-uniform within tonnage range so small deposits are as common as large
  const logMin = Math.log10(profile.tonnageMin);
  const logMax = Math.log10(profile.tonnageMax);
  const tonnage = 10 ** (logMin + t2 * (logMax - logMin));
  return { grade, tonnage };
}
