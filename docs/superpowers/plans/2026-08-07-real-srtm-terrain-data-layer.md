# Real SRTM Terrain Data Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the synthetic value-noise terrain grid with real SRTM elevation data (downloaded from AWS Open Data, no auth) downsampled to a 0.25° global grid, keeping value-noise as a hermetic fallback when tiles aren't cached.

**Architecture:** A new `scripts/lib/srtm-seed.ts` parses cached SRTM GeoTIFF tiles and downsamples them to a 0.25° grid (720×1440 = 1,036,800 cells). `scripts/lib/terrain-seed.ts` auto-detects whether SRTM tiles are present and uses them, else falls back to the existing value-noise generator at the same 0.25° resolution. Shared grid math lives in `lib/constants/terrain.ts`. `scripts/fetch-geological-data.ts` gains an SRTM tile download loop. A new `scripts/build-terrain-texture.ts` emits a JSON heightmap for the frontend. `TerrainRepository.getTerrainCellNear` switches to exact index lookup.

**Tech Stack:** TypeScript, better-sqlite3, tsx scripts, vitest, `geotiff` (pure-JS GeoTIFF parser).

## Global Constraints

- Windows PowerShell 5.1 shell; use `cmd1; if ($?) { cmd2 }` for dependent chains.
- `npm test` = `vitest run`; `npm run lint` = `eslint .`; `npm run typecheck` = `nuxt typecheck`; `npm run build:template` = `tsx scripts/build-template.ts`; `npm run fetch:data` = `tsx scripts/fetch-geological-data.ts`.
- New runtime dependency `geotiff` is explicitly approved by the spec (pure JS, no native deps). No other new dependencies.
- All new files TypeScript strict; follow existing patterns in the repo.
- Do NOT add comments unless explicitly requested.
- Do NOT commit unless explicitly requested.
- The `TerrainCell` shape used by the seed scripts is the one from `scripts/lib/value-noise.ts` (`latIndex`, `lonIndex`, `lat`, `lon`, `elevation`, `terrainClass` as string). This is distinct from `lib/types/terrain.ts`'s `TerrainCell` (which has `baseElevation`/`effectiveElevation`/`modified`). Do not conflate them.
- Grid resolution is 0.25° for BOTH the SRTM path and the noise fallback, so `lib/constants/terrain.ts` index math is always valid.

---

## File Structure

**New files:**
- `lib/constants/terrain.ts` — shared grid constants + lat/lon↔index conversion
- `lib/constants/terrain.test.ts` — unit tests for the conversion functions
- `scripts/lib/srtm-seed.ts` — SRTM GeoTIFF parser + 0.25° downsampler
- `scripts/lib/srtm-seed.test.ts` — unit tests with synthetic GeoTIFF fixtures
- `scripts/build-terrain-texture.ts` — reads `terrain` table, writes `public/data/geological/terrain-heightmap.json`
- `scripts/build-terrain-texture.test.ts` — unit test for the heightmap builder

**Modified files:**
- `package.json` — add `geotiff` dep; add `build:terrain` script; update `db:rebuild` chain
- `scripts/lib/value-noise.ts` — change `DEFAULT_TERRAIN_CONFIG.resolution` to `0.25`
- `scripts/lib/terrain-seed.ts` — auto-detect SRTM vs noise fallback; add `source` to result; accept `tilesDir`
- `scripts/fetch-geological-data.ts` — add SRTM tile download loop
- `scripts/build-template.ts` — pass tiles dir to `seedTerrainGrid`; log source
- `scripts/seed-terrain.ts` — pass tiles dir to `seedTerrainGrid`
- `server/domains/terrain/Repositories/TerrainRepository.ts` — exact index lookup in `getTerrainCellNear`
- `server/db/integration.test.ts` — update terrain cell count assertion

---

### Task 1: Grid math constants (`lib/constants/terrain.ts`)

**Files:**
- Create: `lib/constants/terrain.ts`
- Test: `lib/constants/terrain.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TERRAIN_RESOLUTION` (number), `TERRAIN_LAT_CELLS` (number), `TERRAIN_LON_CELLS` (number), `latToIndex(lat: number): number`, `lonToIndex(lon: number): number`, `indexToLat(index: number): number`, `indexToLon(index: number): number`. Later tasks (Task 2, Task 3, Task 4) import these.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'vitest';
import {
  TERRAIN_LAT_CELLS,
  TERRAIN_LON_CELLS,
  TERRAIN_RESOLUTION,
  indexToLat,
  indexToLon,
  latToIndex,
  lonToIndex,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/constants/terrain.test.ts`
Expected: FAIL — module `./terrain` not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/constants/terrain.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run lint + typecheck**

Run: `npm run lint; if ($?) { npm run typecheck }`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/constants/terrain.ts lib/constants/terrain.test.ts
git commit -m "feat(terrain): add 0.25° grid constants and index conversion"
```

---

### Task 2: Exact index lookup in `TerrainRepository.getTerrainCellNear`

**Files:**
- Modify: `server/domains/terrain/Repositories/TerrainRepository.ts:9-16`
- Test: `server/domains/terrain/Repositories/TerrainRepository.test.ts` (new)

**Interfaces:**
- Consumes: `latToIndex`, `lonToIndex` from `lib/constants/terrain` (Task 1).
- Produces: unchanged `getTerrainCellNear(lat, lon)` signature — now returns the exact 0.25° cell instead of a 0.5°-tolerance scan.

- [ ] **Step 1: Write the failing test**

```typescript
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { TerrainRepository } from './TerrainRepository';

const openDbs = new Set<Database.Database>();

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE terrain (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat_index INTEGER NOT NULL,
      lon_index INTEGER NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      elevation REAL NOT NULL,
      terrain_class TEXT NOT NULL
    );
    CREATE TABLE terrain_modifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat_index INTEGER NOT NULL,
      lon_index INTEGER NOT NULL,
      elevation_delta REAL NOT NULL,
      new_terrain_class TEXT,
      modified_by TEXT NOT NULL,
      modified_at_tick INTEGER NOT NULL,
      operation_id TEXT NOT NULL,
      reason TEXT NOT NULL
    );
    CREATE TABLE meta (key TEXT PRIMARY KEY, tick_count INTEGER);
  `);
  openDbs.add(db);
  return db;
}

afterEach(() => {
  for (const db of Array.from(openDbs)) {
    db.close();
    openDbs.delete(db);
  }
});

describe('TerrainRepository.getTerrainCellNear', () => {
  it('returns the exact 0.25° cell for a coordinate', () => {
    const db = createDb();
    db.prepare(`INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(360, 720, 0, 0, 100, 'Plain');
    const repo = new TerrainRepository(db as never);
    const cell = repo.getTerrainCellNear(0.1, 0.1);
    expect(cell).toBeDefined();
    expect(cell!.latIndex).toBe(360);
    expect(cell!.lonIndex).toBe(720);
  });

  it('returns undefined when no cell matches the exact index', () => {
    const db = createDb();
    db.prepare(`INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(360, 720, 0, 0, 100, 'Plain');
    const repo = new TerrainRepository(db as never);
    expect(repo.getTerrainCellNear(45, 45)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/domains/terrain/Repositories/TerrainRepository.test.ts`
Expected: FAIL — `getTerrainCellNear` uses a 0.5° tolerance scan, so `(0.1, 0.1)` matches the `(0,0)` cell but the test asserts exact index semantics; the second test may pass. The first test's assertion on exact index is the gate.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `getTerrainCellNear` in `server/domains/terrain/Repositories/TerrainRepository.ts`:

```typescript
import { latToIndex, lonToIndex } from '../../../lib/constants/terrain';

// ...inside class TerrainRepository:
getTerrainCellNear(lat: number, lon: number): typeof schema.terrain.$inferSelect | undefined {
  return this.getTerrainCellByIndex(latToIndex(lat), lonToIndex(lon));
}
```

Remove the now-unused `and`/`sql` imports if they are no longer referenced elsewhere in the file (check first — `getTerrainInBoundingBox` still uses `sql`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/domains/terrain/Repositories/TerrainRepository.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run lint + typecheck**

Run: `npm run lint; if ($?) { npm run typecheck }`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/domains/terrain/Repositories/TerrainRepository.ts server/domains/terrain/Repositories/TerrainRepository.test.ts
git commit -m "feat(terrain): use exact 0.25° index lookup in getTerrainCellNear"
```

---

### Task 3: SRTM GeoTIFF parser + downsampler (`scripts/lib/srtm-seed.ts`)

**Files:**
- Create: `scripts/lib/srtm-seed.ts`
- Test: `scripts/lib/srtm-seed.test.ts`
- Modify: `package.json` (add `geotiff` dependency)

**Interfaces:**
- Consumes: `TerrainCell`, `TerrainGridConfig` from `scripts/lib/value-noise.ts`; `latToIndex`, `lonToIndex` from `lib/constants/terrain` (Task 1).
- Produces: `generateTerrainFromSrtm(tilesDir: string, config: TerrainGridConfig): TerrainCell[]`. Task 4 calls this.

- [ ] **Step 1: Add the `geotiff` dependency**

Run: `npm install geotiff@^2.1.0`
Expected: `geotiff` appears in `package.json` `dependencies`.

- [ ] **Step 2: Write the failing test**

The test builds a synthetic 2×2 GeoTIFF tile grid in a temp dir using `geotiff`'s write API, then asserts downsampling. `geotiff` exposes `writeArrayBuffer` for creating GeoTIFFs.

```typescript
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeArrayBuffer } from 'geotiff';
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

async function writeTile(path: string, width: number, height: number, values: number[]): Promise<void> {
  const data = new Uint16Array(values);
  const arrayBuffer = await writeArrayBuffer(data, { width, height });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, Buffer.from(arrayBuffer));
}

describe('generateTerrainFromSrtm', () => {
  it('downsamples a single tile to 0.25° cells with averaged elevation', async () => {
    const dir = makeTileDir();
    // A 1° tile covering lat 0..1, lon 0..1. 4x4 samples (0.25° each).
    // All samples = 100m → every output cell should be 100m, class Plain.
    await writeTile(join(dir, 'srtm_0_0.tif'), 4, 4, Array(16).fill(100));

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
      expect(c.terrainClass).toBe('Plain');
    }
  });

  it('assigns -1000m to all-nodata (ocean) cells', async () => {
    const dir = makeTileDir();
    // Nodata = -32768. Write a tile where every sample is nodata.
    await writeTile(join(dir, 'srtm_0_0.tif'), 4, 4, Array(16).fill(32768));

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
    // 4 samples: 100, 100, 200, nodata → mean of non-nodata = (100+100+200)/3 = 133.33 → rounds to 133.
    await writeTile(join(dir, 'srtm_0_0.tif'), 2, 2, [100, 100, 200, 32768]);

    const cells = await generateTerrainFromSrtm(dir, {
      resolution: 0.25,
      latMin: 0,
      latMax: 0.5,
      lonMin: 0,
      lonMax: 0.5,
      seed: 0,
      elevationScale: 0,
      baseFrequency: 0,
    });

    expect(cells.length).toBe(4);
    for (const c of cells) {
      expect(c.elevation).toBe(133);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run scripts/lib/srtm-seed.test.ts`
Expected: FAIL — module `./srtm-seed` not found.

- [ ] **Step 4: Write minimal implementation**

```typescript
import { readdirSync } from 'node:fs';
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

function loadTiles(tilesDir: string): Tile[] {
  const tiles: Tile[] = [];
  for (const file of readdirSync(tilesDir)) {
    const m = /^srtm_(-?\d+)_(-?\d+)\.tif$/.exec(file);
    if (!m) continue;
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const buf = readFileSync(join(tilesDir, file));
    const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const image = await tiff.getImage();
    const width = image.getWidth();
    const height = image.getHeight();
    const data = await image.readRasters({ interleave: true }) as number[];
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

  for (let lat = latMin; lat <= latMax + 1e-9; lat += resolution) {
    for (let lon = lonMin; lon <= lonMax + 1e-9; lon += resolution) {
      const samples: number[] = [];
      for (const tile of tiles) {
        if (lat < tile.lat || lat > tile.lat + 1) continue;
        if (lon < tile.lon || lon > tile.lon + 1) continue;
        const row = Math.floor((lat - tile.lat) / (1 / tile.height));
        const col = Math.floor((lon - tile.lon) / (1 / tile.width));
        if (row < 0 || row >= tile.height || col < 0 || col >= tile.width) continue;
        const v = tile.data[row]![col]!;
        if (v !== NODATA) samples.push(v);
      }
      let elevation: number;
      if (samples.length === 0) {
        elevation = OCEAN_DEPTH;
      } else {
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
```

Note: the `loadTiles` helper uses `await` inside a `for...of` loop, so it must be `async`. The `require` call is a Node ESM workaround; prefer `import { readFileSync } from 'node:fs'` at the top and drop the inline `require`. The function signature is `async` and returns `Promise<TerrainCell[]>`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run scripts/lib/srtm-seed.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Run lint + typecheck**

Run: `npm run lint; if ($?) { npm run typecheck }`
Expected: no errors. Fix any `require`/async issues flagged by lint.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/lib/srtm-seed.ts scripts/lib/srtm-seed.test.ts
git commit -m "feat(terrain): add SRTM GeoTIFF parser and 0.25° downsampler"
```

---

### Task 4: Auto-detect SRTM vs noise fallback in `terrain-seed.ts`

**Files:**
- Modify: `scripts/lib/terrain-seed.ts`
- Modify: `scripts/lib/value-noise.ts:91-100` (resolution → 0.25)
- Modify: `scripts/build-template.ts:544-549` (pass tiles dir, log source)
- Modify: `scripts/seed-terrain.ts:27-29` (pass tiles dir)
- Test: `scripts/lib/terrain-seed.test.ts` (new)

**Interfaces:**
- Consumes: `generateTerrainFromSrtm` from `scripts/lib/srtm-seed` (Task 3); `generateTerrainGrid`, `DEFAULT_TERRAIN_CONFIG` from `value-noise`.
- Produces: `seedTerrainGrid(db, config?, tilesDir?): TerrainSeedResult` where `TerrainSeedResult = { insertedCells: number; resolution: number; source: 'srtm' | 'noise' }`.

- [ ] **Step 1: Write the failing test**

```typescript
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { seedTerrainGrid } from './terrain-seed';

const openDbs = new Set<Database.Database>();
const tempDirs: string[] = [];

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE terrain (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat_index INTEGER NOT NULL,
      lon_index INTEGER NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      elevation REAL NOT NULL,
      terrain_class TEXT NOT NULL
    );
  `);
  openDbs.add(db);
  return db;
}

afterEach(() => {
  for (const db of Array.from(openDbs)) {
    db.close();
    openDbs.delete(db);
  }
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe('seedTerrainGrid', () => {
  it('falls back to value-noise when no SRTM tiles are present', () => {
    const db = createDb();
    const emptyDir = mkdtempSync(join(tmpdir(), 'no-tiles-'));
    tempDirs.push(emptyDir);
    const result = seedTerrainGrid(db, undefined, emptyDir);
    expect(result.source).toBe('noise');
    expect(result.insertedCells).toBeGreaterThan(0);
    const count = db.prepare('SELECT COUNT(*) AS n FROM terrain').get() as { n: number };
    expect(count.n).toBe(result.insertedCells);
  });

  it('is idempotent (second run is a no-op)', () => {
    const db = createDb();
    const emptyDir = mkdtempSync(join(tmpdir(), 'no-tiles-'));
    tempDirs.push(emptyDir);
    const first = seedTerrainGrid(db, undefined, emptyDir);
    expect(first.insertedCells).toBeGreaterThan(0);
    const second = seedTerrainGrid(db, undefined, emptyDir);
    expect(second.insertedCells).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/terrain-seed.test.ts`
Expected: FAIL — `seedTerrainGrid` doesn't accept a third `tilesDir` arg and has no `source` field.

- [ ] **Step 3: Update `value-noise.ts` default resolution**

In `scripts/lib/value-noise.ts`, change `DEFAULT_TERRAIN_CONFIG.resolution` from `1` to `0.25`:

```typescript
export const DEFAULT_TERRAIN_CONFIG: TerrainGridConfig = {
  resolution: 0.25,
  latMin: -90,
  latMax: 90,
  lonMin: -180,
  lonMax: 180,
  seed: 1337,
  elevationScale: 4000,
  baseFrequency: 0.6,
};
```

- [ ] **Step 4: Write minimal implementation**

Replace `scripts/lib/terrain-seed.ts`:

```typescript
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { DEFAULT_TERRAIN_CONFIG, generateTerrainGrid, type TerrainCell, type TerrainGridConfig } from './value-noise';
import { generateTerrainFromSrtm } from './srtm-seed';

export interface TerrainSeedResult {
  insertedCells: number;
  resolution: number;
  source: 'srtm' | 'noise';
}

function hasSrtmTiles(tilesDir: string): boolean {
  if (!existsSync(tilesDir)) return false;
  return readdirSync(tilesDir).some((f) => /^srtm_-?\d+_-?\d+\.tif$/.test(f));
}

export async function seedTerrainGrid(
  db: Database.Database,
  config: TerrainGridConfig = DEFAULT_TERRAIN_CONFIG,
  tilesDir?: string,
): Promise<TerrainSeedResult> {
  const result: TerrainSeedResult = {
    insertedCells: 0,
    resolution: config.resolution,
    source: 'noise',
  };

  const existing = db.prepare(`SELECT COUNT(*) AS n FROM terrain`).get() as { n: number };
  if (existing.n > 0) {
    console.log(`Terrain grid already seeded (${existing.n} cells), skipping.`);
    return result;
  }

  let cells: TerrainCell[];
  if (tilesDir && hasSrtmTiles(tilesDir)) {
    cells = await generateTerrainFromSrtm(tilesDir, config);
    result.source = 'srtm';
  } else {
    console.warn('SRTM tiles not found — falling back to value-noise terrain. Run `npm run fetch:data` to download real elevation data.');
    cells = generateTerrainGrid(config);
    result.source = 'noise';
  }

  const insertStmt = db.prepare(`
    INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows: TerrainCell[]) => {
    for (const c of rows) {
      insertStmt.run(c.latIndex, c.lonIndex, c.lat, c.lon, c.elevation, c.terrainClass);
    }
  });

  const BATCH_SIZE = 5000;
  for (let i = 0; i < cells.length; i += BATCH_SIZE) {
    const batch = cells.slice(i, i + BATCH_SIZE);
    insertMany(batch);
    result.insertedCells += batch.length;
  }

  return result;
}
```

- [ ] **Step 5: Update the call sites**

In `scripts/build-template.ts:547-549`, pass the tiles dir and log the source:

```typescript
const { seedTerrainGrid } = await import('./lib/terrain-seed');
const terrainResult = await seedTerrainGrid(db, undefined, join(root, 'data', 'geological', 'terrain', 'srtm'));
console.log(`Terrain: ${terrainResult.insertedCells} cells @ ${terrainResult.resolution}° resolution (${terrainResult.source})`);
```

In `scripts/seed-terrain.ts:27-29`:

```typescript
const { seedTerrainGrid } = await import('./lib/terrain-seed');
const result = await seedTerrainGrid(db, undefined, join(root, 'data', 'geological', 'terrain', 'srtm'));
console.log(`Terrain: ${result.insertedCells} cells @ ${result.resolution}° resolution (${result.source})`);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run scripts/lib/terrain-seed.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Run lint + typecheck**

Run: `npm run lint; if ($?) { npm run typecheck }`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/terrain-seed.ts scripts/lib/terrain-seed.test.ts scripts/lib/value-noise.ts scripts/build-template.ts scripts/seed-terrain.ts
git commit -m "feat(terrain): auto-detect SRTM tiles with value-noise fallback at 0.25°"
```

---

### Task 5: SRTM tile download loop in `fetch-geological-data.ts`

**Files:**
- Modify: `scripts/fetch-geological-data.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: cached SRTM `.tif` tiles under `data/geological/terrain/srtm/` that Task 4's `hasSrtmTiles` detects.

- [ ] **Step 1: Write the implementation**

Replace the SRTM placeholder block in `scripts/fetch-geological-data.ts:44-48` with a download loop. Add a helper and call it from `main()`:

```typescript
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srtmDir = join(root, 'data', 'geological', 'terrain', 'srtm');

const SRTM_BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/srtm';

async function downloadSrtmTiles(): Promise<void> {
  mkdirSync(srtmDir, { recursive: true });
  let downloaded = 0;
  let skipped = 0;
  let missing = 0;
  for (let lat = -90; lat <= 89; lat++) {
    for (let lon = -180; lon <= 179; lon++) {
      const path = join(srtmDir, `srtm_${lat}_${lon}.tif`);
      if (existsSync(path)) {
        skipped++;
        continue;
      }
      const url = `${SRTM_BASE}/srtm_${lat}_${lon}.tif`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          writeFileSync(path, buf);
          downloaded++;
        } else if (res.status === 404) {
          missing++;
        } else {
          console.log(`  srtm_${lat}_${lon}: HTTP ${res.status}`);
        }
      } catch (e) {
        console.log(`  srtm_${lat}_${lon}: error ${e instanceof Error ? e.message : 'unknown'}`);
      }
      if ((downloaded + skipped + missing) % 500 === 0) {
        console.log(`  SRTM progress: ${downloaded} downloaded, ${skipped} cached, ${missing} ocean (no tile)`);
      }
    }
  }
  console.log(`SRTM complete: ${downloaded} downloaded, ${skipped} cached, ${missing} ocean tiles skipped.`);
}
```

Call `await downloadSrtmTiles()` inside `main()` after the MRDS block, replacing the old placeholder `console.log` lines.

- [ ] **Step 2: Verify it runs (dry, no full download)**

Run: `node -e "console.log('fetch-geological-data.ts updated; full download requires network and ~2-4GB. Run npm run fetch:data to execute.')"`
Expected: informational message. Do NOT run the full download in this task (it is large and network-bound). The script is idempotent and safe to run later.

- [ ] **Step 3: Run lint + typecheck**

Run: `npm run lint; if ($?) { npm run typecheck }`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-geological-data.ts
git commit -m "feat(terrain): add SRTM tile download loop from AWS Open Data"
```

---

### Task 6: Heightmap builder (`scripts/build-terrain-texture.ts`)

**Files:**
- Create: `scripts/build-terrain-texture.ts`
- Create: `scripts/build-terrain-texture.test.ts`
- Modify: `package.json` (add `build:terrain` script; update `db:rebuild` chain)

**Interfaces:**
- Consumes: `TERRAIN_LAT_CELLS`, `TERRAIN_LON_CELLS` from `lib/constants/terrain` (Task 1).
- Produces: `buildTerrainHeightmap(db): { width: number; height: number; outputPath: string; cells: number }` and writes `public/data/geological/terrain-heightmap.json`.

- [ ] **Step 1: Write the failing test**

```typescript
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTerrainHeightmap } from './build-terrain-texture';

const openDbs = new Set<Database.Database>();

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE terrain (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat_index INTEGER NOT NULL,
      lon_index INTEGER NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      elevation REAL NOT NULL,
      terrain_class TEXT NOT NULL
    );
  `);
  openDbs.add(db);
  return db;
}

afterEach(() => {
  for (const db of Array.from(openDbs)) {
    db.close();
    openDbs.delete(db);
  }
});

describe('buildTerrainHeightmap', () => {
  it('produces a row-major elevation array with correct dimensions', () => {
    const db = createDb();
    db.prepare(`INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(0, 0, -90, -180, -1000, 'Ocean');
    db.prepare(`INSERT INTO terrain (lat_index, lon_index, lat, lon, elevation, terrain_class) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(360, 720, 0, 0, 100, 'Plain');

    const result = buildTerrainHeightmap(db);
    expect(result.width).toBe(1440);
    expect(result.height).toBe(720);
    expect(result.cells).toBe(2);
    expect(result.data.length).toBe(720 * 1440);
    // Row-major: index = latIndex * 1440 + lonIndex
    expect(result.data[0]).toBe(-1000);
    expect(result.data[360 * 1440 + 720]).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/build-terrain-texture.test.ts`
Expected: FAIL — module `./build-terrain-texture` not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import { TERRAIN_LAT_CELLS, TERRAIN_LON_CELLS } from '../lib/constants/terrain';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const OUTPUT_PATH = join(root, 'public', 'data', 'geological', 'terrain-heightmap.json');

export interface TerrainHeightmapResult {
  width: number;
  height: number;
  cells: number;
  data: number[];
  outputPath: string;
}

export function buildTerrainHeightmap(db: Database.Database): TerrainHeightmapResult {
  const width = TERRAIN_LON_CELLS;
  const height = TERRAIN_LAT_CELLS;
  const data = new Array<number>(width * height).fill(0);
  const rows = db.prepare(`SELECT lat_index, lon_index, elevation FROM terrain`).all() as Array<{ lat_index: number; lon_index: number; elevation: number }>;
  for (const r of rows) {
    data[r.lat_index * width + r.lon_index] = r.elevation;
  }
  return { width, height, cells: rows.length, data, outputPath: OUTPUT_PATH };
}

export function writeTerrainHeightmap(result: TerrainHeightmapResult): void {
  mkdirSync(dirname(result.outputPath), { recursive: true });
  writeFileSync(result.outputPath, JSON.stringify(result), 'utf-8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/build-terrain-texture.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Add the npm scripts**

In `package.json` `scripts`, add:

```json
"build:terrain": "tsx scripts/build-terrain-texture.ts",
```

Update `db:rebuild` to include `build:terrain` before `build:template`:

```json
"db:rebuild": "node -e \"require('fs').rmSync('data/games/_template.db',{force:true})\" && tsx scripts/build-climate-texture.ts && tsx scripts/build-terrain-texture.ts && tsx scripts/build-template.ts",
```

- [ ] **Step 6: Run lint + typecheck**

Run: `npm run lint; if ($?) { npm run typecheck }`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-terrain-texture.ts scripts/build-terrain-texture.test.ts package.json
git commit -m "feat(terrain): add heightmap builder and wire into db:rebuild"
```

---

### Task 7: Update integration test cell count assertion

**Files:**
- Modify: `server/db/integration.test.ts:169-172`

**Interfaces:**
- Consumes: the rebuilt template DB (via `npm run build:template`).
- Produces: an assertion that holds for both the SRTM path (~1M cells) and the noise fallback (~1M cells at 0.25°).

- [ ] **Step 1: Write the updated test**

Replace the existing test:

```typescript
it('seeds terrain grid with >1000000 cells', () => {
  const count = db.prepare('SELECT COUNT(*) as n FROM terrain').get() as { n: number };
  expect(count.n).toBeGreaterThan(1000000);
});
```

- [ ] **Step 2: Rebuild the template DB**

Run: `npm run build:template`
Expected: terrain seeding logs `Terrain: <n> cells @ 0.25° resolution (noise)` (or `srtm` if tiles are present). The count should be ~1,036,800.

- [ ] **Step 3: Run the integration test**

Run: `npx vitest run server/db/integration.test.ts`
Expected: PASS — the terrain count assertion passes with >1,000,000 cells.

- [ ] **Step 4: Run lint + typecheck**

Run: `npm run lint; if ($?) { npm run typecheck }`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/db/integration.test.ts
git commit -m "test(terrain): assert >1M terrain cells at 0.25° resolution"
```

---

## Self-Review

**Spec coverage (Parts 1+2):**
- `scripts/lib/srtm-seed.ts` — Task 3 ✓
- `scripts/fetch-geological-data.ts` SRTM loop — Task 5 ✓
- `scripts/lib/terrain-seed.ts` SRTM + fallback — Task 4 ✓
- `scripts/seed-terrain.ts` / `scripts/build-template.ts` call sites — Task 4 ✓
- `package.json` `geotiff` dep — Task 3 ✓
- `scripts/build-terrain-texture.ts` + `build:terrain` + `db:rebuild` — Task 6 ✓
- `lib/constants/terrain.ts` — Task 1 ✓
- `TerrainRepository.getTerrainCellNear` exact lookup — Task 2 ✓
- Integration test count — Task 7 ✓

**Deferred to follow-on plans (not in this plan):** Part 3 (A* pathfinding), Part 4 (facility construction costs), Part 5 (EarthGlobe vertex displacement). These depend on the data layer and are separate, independently testable subsystems.

**Placeholder scan:** No TBD/TODO/placeholder patterns. All code blocks are concrete.

**Type consistency:**
- `TerrainCell` used in Tasks 3/4 is the `value-noise.ts` shape (`elevation`, `terrainClass: string`). ✓
- `latToIndex`/`lonToIndex`/`indexToLat`/`indexToLon` names consistent across Tasks 1, 2, 3, 6. ✓
- `seedTerrainGrid(db, config?, tilesDir?)` signature consistent between Task 4 and its call sites. ✓
- `TerrainSeedResult.source` field consistent between Task 4 and call-site logging. ✓
- `generateTerrainFromSrtm(tilesDir, config)` returns `Promise<TerrainCell[]>` (async) — Task 4 awaits it. ✓
- `buildTerrainHeightmap(db)` returns `TerrainHeightmapResult` with `data` array — Task 6 test matches. ✓
