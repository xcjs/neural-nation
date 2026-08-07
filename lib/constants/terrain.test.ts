import { describe, expect, it } from 'vitest';
import {
  indexToLat,
  indexToLon,
  latToIndex,
  lonToIndex,
  TERRAIN_LAT_CELLS,
  TERRAIN_LON_CELLS,
  TERRAIN_RESOLUTION,
} from './terrain';

describe('terrain grid constants', () => {
  it('uses 0.25° resolution over a 720×1440 grid', () => {
    expect(TERRAIN_RESOLUTION).toBe(0.25);
    expect(TERRAIN_LAT_CELLS).toBe(720);
    expect(TERRAIN_LON_CELLS).toBe(1440);
  });

  it('round-trips lat/lon through index conversion', () => {
    for (const lat of [-90, -45, 0, 45, 90]) {
      expect(indexToLat(latToIndex(lat))).toBeCloseTo(lat, 6);
    }
    for (const lon of [-180, -90, 0, 90, 180]) {
      expect(indexToLon(lonToIndex(lon))).toBeCloseTo(lon, 6);
    }
  });

  it('maps the poles and antimeridian to the expected indices', () => {
    expect(latToIndex(-90)).toBe(0);
    expect(latToIndex(90)).toBe(720);
    expect(lonToIndex(-180)).toBe(0);
    expect(lonToIndex(180)).toBe(1440);
  });

  it('clamps out-of-range lat/lon to the grid edges', () => {
    expect(latToIndex(-100)).toBe(0);
    expect(latToIndex(100)).toBe(720);
    expect(lonToIndex(-200)).toBe(0);
    expect(lonToIndex(200)).toBe(1440);
  });
});
