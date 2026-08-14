import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromArrayBuffer } from 'geotiff';
import { latToIndex, lonToIndex } from '../../lib/constants/terrain';
import { classifyTerrainClass, type TerrainCell, type TerrainGridConfig } from './value-noise';

const NODATA = -32768;
const OCEAN_DEPTH = -1000;

interface Tile {
  zoom: number;
  x: number;
  y: number;
  width: number; // pixels (512)
  height: number; // pixels (512)
  lon0: number; // top-left (northwest) longitude
  lat0: number; // top-left (northwest) latitude
  pixelScaleX: number; // degrees per pixel (x)
  pixelScaleY: number; // degrees per pixel (y)
  data: number[]; // row-major, length = width * height, data[row * width + col]
}

async function loadTiles(tilesDir: string): Promise<Tile[]> {
  const tiles: Tile[] = [];
  for (const file of readdirSync(tilesDir)) {
    const m = /^(\d+)_(\d+)_(\d+)\.tif$/.exec(file);
    if (!m)
      continue;
    const zoom = Number(m[1]);
    const x = Number(m[2]);
    const y = Number(m[3]);
    const buf = readFileSync(join(tilesDir, file));
    const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const image = await tiff.getImage();
    const width = image.getWidth();
    const height = image.getHeight();
    const fd = image.getFileDirectory();
    const scale = fd.ModelPixelScale;
    const tiepoint = fd.ModelTiepoint;
    const pixelScaleX = scale[0];
    const pixelScaleY = scale[1];
    const lon0 = tiepoint[3];
    const lat0 = tiepoint[4];
    const data = await image.readRasters({ interleave: true, samples: [0] }) as unknown as number[];
    tiles.push({ zoom, x, y, width, height, lon0, lat0, pixelScaleX, pixelScaleY, data });
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
  for (let li = 0; li < latCount; li++) {
    const lat = latMin + li * resolution + resolution / 2;
    for (let loni = 0; loni < lonCount; loni++) {
      const lon = lonMin + loni * resolution + resolution / 2;

      let elevation = OCEAN_DEPTH;
      for (const tile of tiles) {
        const tileLonMax = tile.lon0 + tile.width * tile.pixelScaleX;
        const tileLatMin = tile.lat0 - tile.height * tile.pixelScaleY;
        if (lon >= tile.lon0 && lon < tileLonMax && lat <= tile.lat0 && lat > tileLatMin) {
          let col = Math.round((lon - tile.lon0) / tile.pixelScaleX);
          let row = Math.round((tile.lat0 - lat) / tile.pixelScaleY);
          col = Math.min(tile.width - 1, Math.max(0, col));
          row = Math.min(tile.height - 1, Math.max(0, row));
          const value = tile.data[row * tile.width + col]!;
          elevation = value === NODATA ? OCEAN_DEPTH : value;
          break;
        }
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
