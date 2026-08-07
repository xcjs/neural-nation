export const TERRAIN_RESOLUTION = 0.25;
export const TERRAIN_LAT_CELLS = 720;
export const TERRAIN_LON_CELLS = 1440;

export function latToIndex(lat: number): number {
  return Math.min(TERRAIN_LAT_CELLS, Math.max(0, Math.round((lat + 90) / TERRAIN_RESOLUTION)));
}

export function lonToIndex(lon: number): number {
  return Math.min(TERRAIN_LON_CELLS, Math.max(0, Math.round((lon + 180) / TERRAIN_RESOLUTION)));
}

export function indexToLat(index: number): number {
  return index * TERRAIN_RESOLUTION - 90;
}

export function indexToLon(index: number): number {
  return index * TERRAIN_RESOLUTION - 180;
}
