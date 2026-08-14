import { Buffer } from 'node:buffer';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateTerrainFromSrtm } from './srtm-seed';

const tempDirs: string[] = [];

function makeTileDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'srtm-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

// Writes a minimal little-endian baseline TIFF with a single signed 16-bit
// grayscale strip, plus ModelPixelScale (tag 33550) and ModelTiepoint
// (tag 33922) DOUBLE IFD entries so the parser can read geo bounds from
// GeoTIFF metadata. geotiff's own writeArrayBuffer truncates 16-bit values
// to 8 bits, so it cannot round-trip SRTM-style 16-bit samples. Real Mapzen
// Terrain Tiles store elevation as signed Int16 with -32768 as the
// nodata/void sentinel and geo-reference via ModelPixelScale + ModelTiepoint.
function writeTile(
  path: string,
  width: number,
  height: number,
  values: number[],
  lon0: number,
  lat0: number,
  pixelScale: number,
): void {
  const pixelCount = width * height;
  const ifdEntryCount = 12;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;
  const pixelOffset = 8 + ifdSize;
  const pixelBytes = pixelCount * 2;
  const doubleOffset = pixelOffset + pixelBytes;
  const doubleCount = 9; // 3 (pixelScale) + 6 (tiepoint)
  const doubleBytes = doubleCount * 8;
  const buf = Buffer.alloc(doubleOffset + doubleBytes);

  buf.write('II', 0, 'ascii');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(8, 4);

  buf.writeUInt16LE(ifdEntryCount, 8);
  let e = 10;
  const entry = (tag: number, type: number, count: number, value: number): void => {
    buf.writeUInt16LE(tag, e);
    buf.writeUInt16LE(type, e + 2);
    buf.writeUInt32LE(count, e + 4);
    buf.writeUInt32LE(value, e + 8);
    e += 12;
  };
  entry(256, 3, 1, width);
  entry(257, 3, 1, height);
  entry(258, 3, 1, 16);
  entry(259, 3, 1, 1);
  entry(262, 3, 1, 1);
  entry(273, 4, 1, pixelOffset);
  entry(277, 3, 1, 1);
  entry(278, 4, 1, height);
  entry(279, 4, 1, pixelBytes);
  entry(339, 3, 1, 2);
  // ModelPixelScale (tag 33550, type 12=DOUBLE, count 3) → offset to doubles
  entry(33550, 12, 3, doubleOffset);
  // ModelTiepoint (tag 33922, type 12=DOUBLE, count 6) → offset to doubles[3]
  entry(33922, 12, 6, doubleOffset + 3 * 8);
  buf.writeUInt32LE(0, e);

  for (let i = 0; i < pixelCount; i++) {
    buf.writeInt16LE(values[i]!, pixelOffset + i * 2);
  }

  // ModelPixelScale: [pixelScale, pixelScale, 0]
  buf.writeDoubleLE(pixelScale, doubleOffset);
  buf.writeDoubleLE(pixelScale, doubleOffset + 8);
  buf.writeDoubleLE(0, doubleOffset + 16);
  // ModelTiepoint: [0, 0, 0, lon0, lat0, 0]
  buf.writeDoubleLE(0, doubleOffset + 24);
  buf.writeDoubleLE(0, doubleOffset + 32);
  buf.writeDoubleLE(0, doubleOffset + 40);
  buf.writeDoubleLE(lon0, doubleOffset + 48);
  buf.writeDoubleLE(lat0, doubleOffset + 56);
  buf.writeDoubleLE(0, doubleOffset + 64);

  writeFileSync(path, buf);
}

describe('generateTerrainFromSrtm', () => {
  it('samples nearest pixels from a single slippy-map tile', async () => {
    const dir = makeTileDir();
    // A 4x4 tile covering lon [0, 1], lat [0, 1] (pixelScale 0.25, tiepoint
    // lon0=0, lat0=1). Exclusive bounds → 4 lat × 4 lon = 16 cells, each
    // cell center maps to a pixel. All pixels = 100m → class Coastal.
    writeTile(
      join(dir, '6_32_32.tif'),
      4,
      4,
      Array.from({ length: 16 }, () => 100),
      0,
      1,
      0.25,
    );

    const cells = await generateTerrainFromSrtm(dir, {
      resolution: 0.25,
      latMin: 0,
      latMax: 1,
      lonMin: 0,
      lonMax: 1,
      seed: 0,
      elevationScale: 0,
      baseFrequency: 0,
    });

    expect(cells.length).toBe(16); // 4 lat × 4 lon (exclusive bounds)
    for (const c of cells) {
      expect(c.elevation).toBe(100);
      expect(c.terrainClass).toBe('Coastal');
    }
  });

  it('treats nodata pixels as ocean (-1000m)', async () => {
    const dir = makeTileDir();
    writeTile(
      join(dir, '6_32_32.tif'),
      4,
      4,
      Array.from({ length: 16 }, () => -32768),
      0,
      1,
      0.25,
    );

    const cells = await generateTerrainFromSrtm(dir, {
      resolution: 0.25,
      latMin: 0,
      latMax: 1,
      lonMin: 0,
      lonMax: 1,
      seed: 0,
      elevationScale: 0,
      baseFrequency: 0,
    });

    expect(cells.length).toBe(16);
    for (const c of cells) {
      expect(c.elevation).toBe(-1000);
      expect(c.terrainClass).toBe('Ocean');
    }
  });

  it('assigns ocean depth to cells with no covering tile', async () => {
    const dir = makeTileDir(); // empty: no .tif files

    const cells = await generateTerrainFromSrtm(dir, {
      resolution: 0.25,
      latMin: 0,
      latMax: 1,
      lonMin: 0,
      lonMax: 1,
      seed: 0,
      elevationScale: 0,
      baseFrequency: 0,
    });

    expect(cells.length).toBe(16);
    for (const c of cells) {
      expect(c.elevation).toBe(-1000);
      expect(c.terrainClass).toBe('Ocean');
    }
  });
});
