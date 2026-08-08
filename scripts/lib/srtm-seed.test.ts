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
// grayscale strip. geotiff's own writeArrayBuffer truncates 16-bit values to
// 8 bits (geotiffwriter.js: `new Uint8Array(values)`), so it cannot round-trip
// SRTM-style 16-bit samples. Real SRTM tiles store elevation as signed Int16
// with -32768 as the nodata/void sentinel, so this helper writes SampleFormat=2
// (signed) and the parser reads the exact values back.
function writeTile(path: string, width: number, height: number, values: number[]): void {
  const pixelCount = width * height;
  const ifdEntryCount = 10;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;
  const pixelOffset = 8 + ifdSize;
  const buf = Buffer.alloc(pixelOffset + pixelCount * 2);

  // TIFF header (little-endian).
  buf.write('II', 0, 'ascii');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(8, 4); // offset to first IFD

  // IFD.
  buf.writeUInt16LE(ifdEntryCount, 8);
  let e = 10;
  const entry = (tag: number, type: number, count: number, value: number): void => {
    buf.writeUInt16LE(tag, e);
    buf.writeUInt16LE(type, e + 2);
    buf.writeUInt32LE(count, e + 4);
    buf.writeUInt32LE(value, e + 8);
    e += 12;
  };
  entry(256, 3, 1, width); // ImageWidth
  entry(257, 3, 1, height); // ImageLength
  entry(258, 3, 1, 16); // BitsPerSample
  entry(259, 3, 1, 1); // Compression = none
  entry(262, 3, 1, 1); // PhotometricInterpretation = BlackIsZero
  entry(273, 4, 1, pixelOffset); // StripOffsets
  entry(277, 3, 1, 1); // SamplesPerPixel
  entry(278, 4, 1, height); // RowsPerStrip
  entry(279, 4, 1, pixelCount * 2); // StripByteCounts
  entry(339, 3, 1, 2); // SampleFormat = signed integer
  buf.writeUInt32LE(0, e); // next IFD offset

  // Pixel data (signed 16-bit).
  for (let i = 0; i < pixelCount; i++) {
    buf.writeInt16LE(values[i]!, pixelOffset + i * 2);
  }

  writeFileSync(path, buf);
}

describe('generateTerrainFromSrtm', () => {
  it('downsamples a single tile to 0.25° cells with averaged elevation', async () => {
    const dir = makeTileDir();
    // A 1° tile covering lat 0..1, lon 0..1. 4x4 samples (0.25° each).
    // All samples = 100m → every output cell should be 100m, class Plain.
    writeTile(join(dir, 'srtm_0_0.tif'), 4, 4, Array.from({ length: 16 }, () => 100));

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

    expect(cells.length).toBe(16); // 4 lat × 4 lon at 0.25°
    for (const c of cells) {
      expect(c.elevation).toBe(100);
      expect(c.terrainClass).toBe('Coastal');
    }
  });

  it('assigns -1000m to all-nodata (ocean) cells', async () => {
    const dir = makeTileDir();
    // Nodata = -32768. Write a tile where every sample is nodata.
    writeTile(join(dir, 'srtm_0_0.tif'), 4, 4, Array.from({ length: 16 }, () => -32768));

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

  it('averages non-nodata samples and skips nodata in the mean', async () => {
    const dir = makeTileDir();
    // A 1° tile covering lat 0..1, lon 0..1 with 8x8 samples (0.125° each).
    // Each 0.25° cell aggregates a 2x2 block. The bottom-left 0.25° cell
    // (lat 0..0.25, lon 0..0.25) sees samples: 100, 100, 200, nodata →
    // mean of non-nodata = (100+100+200)/3 = 133.33 → rounds to 133.
    const values: number[] = Array.from({ length: 64 }, () => 300);
    // Bottom-left cell = rows 0,1 cols 0,1 (row index = floor(lat / 0.125)).
    values[0 * 8 + 0] = 100;
    values[0 * 8 + 1] = 100;
    values[1 * 8 + 0] = 200;
    values[1 * 8 + 1] = -32768; // nodata

    writeTile(join(dir, 'srtm_0_0.tif'), 8, 8, values);

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
    // Bottom-left cell (lat 0..0.25, lon 0..0.25) = rows 0,1 cols 0,1:
    // [100, 100] + [200, nodata] → non-nodata mean = 133.
    const cell = cells.find(c => c.lat === 0 && c.lon === 0);
    expect(cell).toBeDefined();
    expect(cell!.elevation).toBe(133);
  });
});
