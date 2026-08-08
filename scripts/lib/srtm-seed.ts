import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromArrayBuffer } from 'geotiff';
import { latToIndex, lonToIndex } from '../../lib/constants/terrain';
import { classifyTerrainClass, type TerrainCell, type TerrainGridConfig } from './value-noise';

const NODATA = -32768;
const OCEAN_DEPTH = -1000;

interface Tile {
  lat: number;
  lon: number;
  width: number;
  height: number;
  data: number[][];
}

async function loadTiles(tilesDir: string): Promise<Tile[]> {
  const tiles: Tile[] = [];
  for (const file of readdirSync(tilesDir)) {
    const m = /^srtm_(-?\d+)_(-?\d+)\.tif$/.exec(file);
    if (!m)
      continue;
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    const buf = readFileSync(join(tilesDir, file));
    const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const image = await tiff.getImage();
    const width = image.getWidth();
    const height = image.getHeight();
    const data = await image.readRasters({ interleave: true }) as unknown as number[];
    const grid: number[][] = [];
    for (let y = 0; y < height; y++) {
      grid.push(data.slice(y * width, (y + 1) * width));
    }
    tiles.push({ lat, lon, width, height, data: grid });
  }
  return tiles;
}

export async function generateTerrainFromSrtm(
  tilesDir: string,
  config: TerrainGridConfig,
): Promise<TerrainCell[]> {
  const tiles = await loadTiles(tilesDir);
  const cells: TerrainCell[] = [];
  const { resolution, latMin, latMax, lonMin, lonMax } = config;

  const latCount = Math.round((latMax - latMin) / resolution);
  const lonCount = Math.round((lonMax - lonMin) / resolution);
  for (let li = 0; li <= latCount; li++) {
    const lat = latMin + li * resolution;
    for (let loni = 0; loni <= lonCount; loni++) {
      const lon = lonMin + loni * resolution;
      const latHi = lat + resolution;
      const lonHi = lon + resolution;
      const samples: number[] = [];
      for (const tile of tiles) {
        const tileLatHi = tile.lat + 1;
        const tileLonHi = tile.lon + 1;
        if (latHi <= tile.lat || lat >= tileLatHi)
          continue;
        if (lonHi <= tile.lon || lon >= tileLonHi)
          continue;
        const rowLo = Math.max(0, Math.floor((lat - tile.lat) / (1 / tile.height)));
        const rowHi = Math.min(tile.height, Math.ceil((latHi - tile.lat) / (1 / tile.height)));
        const colLo = Math.max(0, Math.floor((lon - tile.lon) / (1 / tile.width)));
        const colHi = Math.min(tile.width, Math.ceil((lonHi - tile.lon) / (1 / tile.width)));
        for (let r = rowLo; r < rowHi; r++) {
          for (let c = colLo; c < colHi; c++) {
            const v = tile.data[r]![c]!;
            if (v !== NODATA)
              samples.push(v);
          }
        }
      }
      let elevation: number;
      if (samples.length === 0) {
        elevation = OCEAN_DEPTH;
      }
      else {
        elevation = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      }
      cells.push({
        latIndex: latToIndex(lat),
        lonIndex: lonToIndex(lon),
        lat: Math.round(lat * 1e6) / 1e6,
        lon: Math.round(lon * 1e6) / 1e6,
        elevation,
        terrainClass: classifyTerrainClass(elevation),
      });
    }
  }
  return cells;
}
