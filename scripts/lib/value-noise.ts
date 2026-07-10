/**
 * Value-noise based terrain generator.
 *
 * Produces a deterministic pseudo-random elevation field over a lat/lon grid
 * using layered value noise. No external dependencies — pure TypeScript.
 *
 * Output elevation is in meters, matching the schema's REAL elevation column.
 * Sea level is at 0m. Ocean cells have negative elevation.
 */

/** Deterministic hash → [0,1) from integer lattice coords + seed. */
function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1597334677) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) / 0xFFFFFFFF)
}

/** Smooth Hermite interpolation between a and b with t∈[0,1]. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Single-octave value noise at continuous (x,y), normalized to [0,1]. */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy

  const v00 = hash2(ix, iy, seed)
  const v10 = hash2(ix + 1, iy, seed)
  const v01 = hash2(ix, iy + 1, seed)
  const v11 = hash2(ix + 1, iy + 1, seed)

  const sx = smooth(fx)
  const sy = smooth(fy)

  const top = lerp(v00, v10, sx)
  const bottom = lerp(v01, v11, sx)
  return lerp(top, bottom, sy)
}

/** Fractal Brownian motion: sum of octaves of value noise. Output ∈ [0,1]. */
function fbm(x: number, y: number, seed: number, octaves = 5, lacunarity = 2, persistence = 0.5): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let max = 0

  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 17)
    max += amp
    amp *= persistence
    freq *= lacunarity
  }

  return sum / max
}

export interface TerrainCell {
  latIndex: number
  lonIndex: number
  lat: number
  lon: number
  elevation: number
  terrainClass: string
}

export interface TerrainGridConfig {
  /** Grid resolution in degrees (lat & lon step). Default 1. */
  resolution: number
  /** Inclusive latitude bounds. */
  latMin: number
  latMax: number
  /** Inclusive longitude bounds. */
  lonMin: number
  lonMax: number
  /** Noise seed for reproducibility. */
  seed: number
  /** Vertical scale of noise in meters before sea-level mask. Default 4000. */
  elevationScale: number
  /** Frequency of base noise. Lower = larger landmasses. Default 0.6. */
  baseFrequency: number
}

export const DEFAULT_TERRAIN_CONFIG: TerrainGridConfig = {
  resolution: 1,
  latMin: -90,
  latMax: 90,
  lonMin: -180,
  lonMax: 180,
  seed: 1337,
  elevationScale: 4000,
  baseFrequency: 0.6,
}

/** Classify elevation into a terrain class (matches terrain/service.ts). */
export function classifyTerrainClass(elevation: number): string {
  if (elevation < 0)
    return 'Ocean'
  if (elevation < 200)
    return 'Coastal'
  if (elevation < 800)
    return 'Plain'
  if (elevation < 1500)
    return 'Hill'
  if (elevation < 3000)
    return 'Mountain'
  return 'HighMountain'
}

/**
 * Generate a global terrain grid.
 *
 * Uses a continent-mask based on low-frequency noise so land/ocean
 * distribution approximates real continents without needing SRTM data.
 * Higher-frequency fbm adds relief detail on top of the continental mask.
 */
export function generateTerrainGrid(config: TerrainGridConfig = DEFAULT_TERRAIN_CONFIG): TerrainCell[] {
  const cells: TerrainCell[] = []
  const { resolution, latMin, latMax, lonMin, lonMax, seed, elevationScale, baseFrequency } = config

  for (let lat = latMin; lat <= latMax + 1e-9; lat += resolution) {
    for (let lon = lonMin; lon <= lonMax + 1e-9; lon += resolution) {
      const latIndex = Math.round(lat / resolution)
      const lonIndex = Math.round(lon / resolution)

      // Continental mask: very low frequency noise → land vs ocean basins
      const continentNoise = fbm(
        lon * baseFrequency * 0.15,
        lat * baseFrequency * 0.15,
        seed,
        3,
        2,
        0.6,
      )

      // Relief detail
      const relief = fbm(
        lon * baseFrequency,
        lat * baseFrequency,
        seed + 999,
        5,
        2,
        0.5,
      )

      // Combine: continent mask dominates, relief adds variation
      // Threshold continent noise at 0.5 → roughly 50% land coverage
      const continentFactor = continentNoise > 0.5
        ? (continentNoise - 0.5) * 2 // land: 0..1
        : (continentNoise - 0.5) * 2 // ocean: -1..0

      // Elevation: land positive, ocean negative
      let elevation: number
      if (continentFactor >= 0) {
        // Land: scale up with some relief variation
        elevation = continentFactor * elevationScale * 0.6 + relief * elevationScale * 0.4
      }
      else {
        // Ocean: scale down (deeper ocean)
        elevation = continentFactor * elevationScale * 0.4 - relief * 200
      }

      // Round to 1m precision
      elevation = Math.round(elevation)

      cells.push({
        latIndex,
        lonIndex,
        lat: Math.round(lat * 1e6) / 1e6,
        lon: Math.round(lon * 1e6) / 1e6,
        elevation,
        terrainClass: classifyTerrainClass(elevation),
      })
    }
  }

  return cells
}
