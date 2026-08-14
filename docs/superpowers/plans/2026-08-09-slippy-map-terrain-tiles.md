# Plan: Real Terrain Data — Slippy-Map Tile Source

**Date:** 2026-08-09
**Branch:** `feature/real-terrain-data`
**Predecessor plan:** `docs/superpowers/plans/2026-08-07-real-srtm-terrain-data-layer.md`
**Spec:** `docs/superpowers/specs/2026-07-29-real-terrain-data-design.md`

## Context

The predecessor plan built an SRTM terrain data layer assuming AWS hosted raw 1°×1° `.tif` files named `srtm_{lat}_{lon}.tif`. That URL pattern is **wrong**. The actual dataset (Mapzen Terrain Tiles on AWS Open Data, bucket `elevation-tiles-prod`) uses **slippy-map tile format** `{format}/{z}/{x}/{y}`. All 7 original tasks are complete and reviewed, but the download loop produces zero tiles and the DB is seeded with value-noise fallback data.

**User decision:** Remove the noise fallback entirely. SRTM (via Mapzen Terrain Tiles) is the only terrain source. Download tiles first, then make code changes.

**Confirmed via `curl.exe`:**
- `https://s3.amazonaws.com/elevation-tiles-prod/geotiff/{z}/{x}/{y}.tif` → 200 OK, real GeoTIFFs (512×512, Int16, 1 sample, ModelPixelScale + ModelTiepoint geo-referencing)
- Zoom 6: 4,096 tiles, ~410 MB total, ~1.22 km/px resolution — sufficient headroom over 0.25° (~28 km) grid
- Tiles are **temporary scratch** (deleted after seeding); final DB (~79 MB) + heightmap JSON (~8 MB) are unchanged in size regardless of source.

## Global Constraints

- **Tile format:** GeoTIFF at zoom 6 (`geotiff/6/{x}/{y}.tif`), 4,096 tiles (64×64 grid)
- **Tile URL base:** `https://s3.amazonaws.com/elevation-tiles-prod/geotiff`
- **Tile storage:** `data/geological/terrain/tiles/` (replaces `srtm/`); files named `{z}_{x}_{y}.tif` (e.g. `6_32_32.tif`)
- **Tile dimensions:** 512×512 px, Int16 signed, 1 sample (elevation in meters), `-32768` = nodata/void, `0` = sea level (water bodies filled)
- **Geo-referencing:** Each GeoTIFF has `ModelPixelScale` (px, py, 0) and `ModelTiepoint` (0, 0, 0, lon0, lat0, 0) where (lon0, lat0) is the **top-left** (northwest) corner. Pixel (col, row) maps to `lon = lon0 + col * px`, `lat = lat0 - row * py` (lat decreases as row increases — top-left origin).
- **Slippy-map bounds:** At zoom z, x ∈ [0, 2^z - 1], y ∈ [0, 2^z - 1]. Tile (x, y) covers Web Mercator projected bounds; the GeoTIFF metadata gives the actual geographic bounds — **use the GeoTIFF metadata, not slippy-map math**, because the tiles include polar coverage beyond standard Web Mercator limits.
- **Grid resolution:** 0.25° (unchanged). `TERRAIN_LAT_CELLS = 720`, `TERRAIN_LON_CELLS = 1440`.
- **Grid bounds:** lat [-90, 90], lon [-180, 180]. **Exclusive upper bounds** for lat/lon iteration (indices 0..719, 0..1439 → 720×1440 = 1,036,800 cells). The inclusive-bounds noise path is being removed, so the exclusive-bounds SRTM path becomes the only path and the contract is unambiguous.
- **Sampling:** Nearest-pixel sampling. For each grid cell center (lat, lon), find the tile containing that point, read the nearest pixel's elevation. No mosaicking or block-averaging across tiles.
- **Nodata handling:** If the nearest pixel is nodata (-32768), elevation = -1000 (ocean depth). If no tile covers the cell (polar/antimeridian gaps), elevation = -1000.
- **Heightmap array:** 720×1440 (721×1441 inclusive edge cells are dropped — index 720/1440 are out of bounds and not stored). The fix-wave from the predecessor plan's final review (making SRTM inclusive to match noise) is **reverted** by this plan: the noise path is removed, so inclusive bounds are no longer needed. The SRTM path uses exclusive bounds, producing exactly 720×1440 = 1,036,800 cells, all within the heightmap array.
- **Integration test:** `server/db/integration.test.ts` asserts `>1000000` cells. 1,036,800 > 1,000,000, so the assertion still passes. Update the test's resolution comment if needed but the threshold stays.
- **No noise fallback:** `terrain-seed.ts` throws if tiles are missing. `generateTerrainGrid` is removed from `value-noise.ts`. `classifyTerrainClass`, `TerrainCell`, `TerrainGridConfig`, `DEFAULT_TERRAIN_CONFIG` stay (used by `srtm-seed.ts`).
- **`geotiff` package:** Already in `package.json` (added in predecessor plan). No new dependencies.
- **Code style:** ESLint config as in predecessor plan (Stroustrup braces, `Array.from` over `new Array`, import sorting).

## Tasks

### Task 1 — Rewrite download loop for slippy-map tiles

**File:** `scripts/fetch-geological-data.ts`

Rewrite `downloadSrtmTiles()` to download zoom-6 GeoTIFF tiles from `https://s3.amazonaws.com/elevation-tiles-prod/geotiff/6/{x}/{y}.tif` for x ∈ [0, 63], y ∈ [0, 63] (4,096 tiles).

**Spec:**
- Replace `SRTM_BASE` const with `const TILE_BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/geotiff';`
- Replace `srtmDir` const with `const tilesDir = join(root, 'data', 'geological', 'terrain', 'tiles');`
- Rename `downloadSrtmTiles` to `downloadTerrainTiles`. Signature: `async function downloadTerrainTiles(zoom = 6): Promise<void>`.
- Loop: `for (let x = 0; x < 2 ** zoom; x++) for (let y = 0; y < 2 ** zoom; y++)`.
- Filename: `join(tilesDir, `${zoom}_${x}_${y}.tif`)`.
- Idempotent: `if (existsSync(path)) { skipped++; continue; }`.
- HTTP: `fetch(url)`. 200 OK → write file. 404 → `missing++` (shouldn't happen at z6, but handle gracefully). Other status → log `tile ${zoom}_${x}_${y}: HTTP ${status}`. Catch exceptions, log `tile ${zoom}_${x}_${y}: error ${msg}`.
- Progress every 500 tiles: `console.log(`  Terrain tiles: ${downloaded} downloaded, ${skipped} cached, ${missing} missing`)`.
- Final summary: `console.log(`Terrain tiles complete: ${downloaded} downloaded, ${skipped} cached, ${missing} missing.`)`.
- In `main()`: replace `await downloadSrtmTiles()` with `await downloadTerrainTiles()`.

**Commit message:** `feat(terrain): download zoom-6 GeoTIFF tiles from Mapzen Terrain Tiles`

**No tests** (network-bound, same as predecessor Task 5).

### Task 2 — Rewrite SRTM parser for slippy-map tiles with nearest-pixel sampling

**File:** `scripts/lib/srtm-seed.ts`

Rewrite `generateTerrainFromSrtm` to parse slippy-map GeoTIFFs and sample nearest pixels.

**Spec:**
- Keep imports: `readdirSync, readFileSync` from `node:fs`, `join` from `node:path`, `fromArrayBuffer` from `geotiff`, `latToIndex, lonToIndex` from `../../lib/constants/terrain`, `classifyTerrainClass, TerrainCell, TerrainGridConfig` from `./value-noise`.
- Keep `NODATA = -32768`, `OCEAN_DEPTH = -1000`.
- Replace `Tile` interface with:

```typescript
interface Tile {
  zoom: number;
  x: number;
  y: number;
  width: number;       // pixels (512)
  height: number;       // pixels (512)
  lon0: number;         // top-left (northwest) longitude
  lat0: number;         // top-left (northwest) latitude
  pixelScaleX: number;  // degrees per pixel (x)
  pixelScaleY: number;  // degrees per pixel (y)
  data: number[];       // row-major, length = width * height, data[row * width + col]
}
```

- Replace `loadTiles` with a function that reads all `.tif` files matching `/^\d+_\d+_\d+\.tif$/` from `tilesDir`. For each file:
  - Parse zoom/x/y from filename.
  - Read file, `fromArrayBuffer`, get image.
  - `width = image.getWidth()`, `height = image.getHeight()`.
  - Extract geo bounds from GeoTIFF metadata: `const fd = image.getFileDirectory(); const scale = fd.ModelPixelScale; const tiepoint = fd.ModelTiepoint;`. `pixelScaleX = scale[0]`, `pixelScaleY = scale[1]`, `lon0 = tiepoint[3]`, `lat0 = tiepoint[4]`.
  - Read raster: `const data = await image.readRasters({ interleave: true, samples: [0] }) as unknown as number[];`
  - Push tile object with flattened `data` (number[], row-major).
- Rewrite `generateTerrainFromSrtm(tilesDir, config): Promise<TerrainCell[]>`:
  - Load tiles.
  - Compute `latCount = Math.round((latMax - latMin) / resolution)` (720), `lonCount = Math.round((lonMax - lonMin) / resolution)` (1440).
  - Loop `li` from 0 to `latCount - 1` (exclusive, 0..719), `loni` from 0 to `lonCount - 1` (exclusive, 0..1439).
  - For each cell, compute `lat = latMin + li * resolution + resolution / 2` (cell center), `lon = lonMin + loni * resolution + resolution / 2` (cell center).
  - Find the tile containing (lat, lon): a tile contains the point if `lon >= tile.lon0 && lon < tile.lon0 + tile.width * tile.pixelScaleX && lat <= tile.lat0 && lat > tile.lat0 - tile.height * tile.pixelScaleY`. (Note: lat decreases as row increases, so the tile's lat range is [lat0 - height*py, lat0].)
  - If no tile found: elevation = OCEAN_DEPTH.
  - If tile found: compute pixel coordinates. `col = Math.round((lon - tile.lon0) / tile.pixelScaleX)`, `row = Math.round((tile.lat0 - lat) / tile.pixelScaleY)`. Clamp to [0, width-1] / [0, height-1]. Read `value = tile.data[row * tile.width + col]`. If `value === NODATA`, elevation = OCEAN_DEPTH, else elevation = value.
  - Push cell: `{ latIndex: latToIndex(lat), lonIndex: lonToIndex(lon), lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, elevation, terrainClass: classifyTerrainClass(elevation) }`.
  - Return cells.

**Test file:** `scripts/lib/srtm-seed.test.ts` — rewrite all 3 tests for the new tile format.

**Test 1 — Nearest-pixel sampling from a single tile:**
- Write a synthetic GeoTIFF tile named `6_32_32.tif` (use the `writeTile` helper, extended to include `ModelPixelScale` and `ModelTiepoint` IFD entries — see test code below).
- Tile: 4×4 px, `pixelScaleX = 0.25`, `pixelScaleY = 0.25`, `lon0 = 0`, `lat0 = 1` (covers lon [0, 1], lat [0, 1]).
- Pixel values: all 100m.
- Config: resolution 0.25, latMin 0, latMax 1, lonMin 0, lonMax 1.
- Expected: 16 cells (4×4, exclusive bounds → indices 0..3). Each cell center (lat 0.125/0.375/0.625/0.875, lon same) maps to a pixel. All 16 cells → elevation 100, class 'Coastal'.

**Test 2 — Nodata pixel → ocean depth:**
- Same tile layout, all pixels = -32768.
- Expected: 16 cells, all elevation -1000, class 'Ocean'.

**Test 3 — No tile covers cell → ocean depth:**
- Empty tiles dir (no `.tif` files).
- Config: resolution 0.25, latMin 0, latMax 1, lonMin 0, lonMax 1.
- Expected: 16 cells, all elevation -1000, class 'Ocean'.

**writeTile helper update:** Add `ModelPixelScale` (tag 33550, type 12 = DOUBLE, count 3) and `ModelTiepoint` (tag 33922, type 12 = DOUBLE, count 6) IFD entries. Store the double values in a data block after the pixel data, and point the IFD entries to that block's offset. Use `Buffer.writeDoubleLE` for the doubles.

```typescript
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
  const entry = (tag, type, count, value) => {
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
    buf.writeInt16LE(values[i], pixelOffset + i * 2);
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
```

**Commit message:** `feat(terrain): rewrite SRTM parser for slippy-map GeoTIFF tiles with nearest-pixel sampling`

### Task 3 — Remove noise fallback, make SRTM the only source

**Files:** `scripts/lib/terrain-seed.ts`, `scripts/lib/value-noise.ts`, `scripts/lib/terrain-seed.test.ts`

**Spec for `terrain-seed.ts`:**
- Remove import of `generateTerrainGrid` from `./value-noise`.
- Remove `hasSrtmTiles` function.
- Remove `source` field from `TerrainSeedResult` (only one source now). New interface: `{ insertedCells: number; resolution: number }`.
- Change `seedTerrainGrid` signature: `tilesDir` is now **required** (not optional). `export async function seedTerrainGrid(db, config = DEFAULT_TERRAIN_CONFIG, tilesDir: string): Promise<TerrainSeedResult>`.
- Remove the `if (tilesDir && hasSrtmTiles(tilesDir))` branch. Always call `generateTerrainFromSrtm(tilesDir, config)`. If the tiles dir doesn't exist or has no `.tif` files, `generateTerrainFromSrtm` returns all-ocean cells (every cell → -1000) — that's acceptable behavior, not an error, since the parser handles missing tiles gracefully (Task 2 test 3).
- Remove the `else` branch (noise fallback) and the `console.warn` about falling back.
- Initialize `result` without `source`.

**Spec for `value-noise.ts`:**
- Remove `generateTerrainGrid` function (lines 124-185).
- Remove the noise helper functions that are now unused: `hash2`, `smooth`, `lerp`, `valueNoise`, `fbm` (lines 12-63). These are only used by `generateTerrainGrid`.
- Keep: `TerrainCell` interface, `TerrainGridConfig` interface, `DEFAULT_TERRAIN_CONFIG`, `classifyTerrainClass`.
- Update the module doc-comment (lines 1-9) to reflect that this file now only provides terrain types and classification, not generation.

**Spec for `terrain-seed.test.ts`:** Rewrite both tests:
- Test 1 — "seeds terrain from SRTM tiles": Create a temp tiles dir, write a synthetic GeoTIFF tile (reuse the `writeTile` helper from `srtm-seed.test.ts` — extract it to a shared helper or duplicate it). Use a 4×4 tile covering lat [0,1], lon [0,1], all 100m. Config: resolution 0.25, latMin 0, latMax 1, lonMin 0, lonMax 1. Assert `result.insertedCells > 0` and `result.insertedCells` equals DB row count. Assert a sampled cell's elevation is 100.
- Test 2 — "is idempotent": Same setup as test 1. Run `seedTerrainGrid` twice. Second run returns `insertedCells: 0`.
- Remove `source` assertions (field no longer exists).

**Note on the `writeTile` helper:** The `srtm-seed.test.ts` and `terrain-seed.test.ts` both need a synthetic GeoTIFF writer. Extract it to `scripts/lib/test-tile-writer.ts` (a shared test utility) and import in both test files. This avoids duplication.

**Commit message:** `feat(terrain): remove noise fallback, make SRTM the only terrain source`

### Task 4 — Update call sites and integration test

**Files:** `scripts/build-template.ts`, `scripts/seed-terrain.ts`, `scripts/build-terrain-texture.ts`, `server/db/integration.test.ts`

**Spec for `build-template.ts`:**
- Update the `seedTerrainGrid` call site (around line 548): change `tilesDir` argument from `join(root, 'data', 'geological', 'terrain', 'srtm')` to `join(root, 'data', 'geological', 'terrain', 'tiles')`. Remove `result.source` from the log line (field removed). Update log to: `console.log(`Terrain: ${result.insertedCells} cells @ ${result.resolution}° resolution`)`.
- Update any comment referencing SRTM or noise fallback.

**Spec for `seed-terrain.ts`:**
- Update the `seedTerrainGrid` call site (around line 28): same changes as `build-template.ts` (tiles dir path, remove `source` from log).
- Update the module doc-comment if it references noise fallback.

**Spec for `build-terrain-texture.ts`:** No code changes needed (it reads from the `terrain` table, source-agnostic). Verify the `writeTerrainHeightmap` fix from the predecessor's final fix-wave is still in place (serializes `{width, height, cells, data}`, not `outputPath`).

**Spec for `server/db/integration.test.ts`:**
- The assertion `>1000000` (line ~170) stays — 1,036,800 > 1,000,000.
- Update the test name if it mentions "noise" or "SRTM" to be source-neutral: e.g. `'> 1000000 terrain cells at 0.25° resolution'` (already source-neutral from predecessor Task 7).
- **Important:** This test requires a built template DB. After code changes, the template DB must be rebuilt with real tiles downloaded. If tiles are not downloaded, `build:template` will produce all-ocean cells (all -1000m), but the cell count will still be 1,036,800 and the assertion will pass. The integration test validates **count**, not elevation values.

**Commit message:** `feat(terrain): update call sites for tiles dir and remove source logging`

### Task 5 — Download tiles, rebuild DB, verify end-to-end

**Not a code task — verification only.**

**Spec:**
- Run `npm run fetch:data` to download the 4,096 zoom-6 GeoTIFF tiles (~410 MB) to `data/geological/terrain/tiles/`.
- Delete the existing template DB: `rm -f data/games/_template.db`.
- Run `npm run build:template` to rebuild the DB with real elevation data.
- Verify the build log shows `Terrain: 1036800 cells @ 0.25° resolution` (no `source` in log anymore — Task 4 removed it).
- Verify tile count: `ls data/geological/terrain/tiles/*.tif | wc -l` should be ~4,096 (some may be missing — acceptable as long as the count is close).
- Run `npm test` — all tests pass, including the integration test's `>1000000` assertion.
- Spot-check elevation data: query the template DB for a known location (e.g., near Mount Everest ~27.99°N, 86.92°E should show high elevation; mid-Pacific ~0°N, -160°W should show -1000 ocean).
- **Do not commit the downloaded tiles** (they're scratch data, gitignored). Do not commit the rebuilt template DB unless the project convention is to commit it (check `.gitignore`).

**Ledger entry:** `Task 5: complete (verification — N tiles downloaded, N cells seeded, all tests pass)`

## Deferred / Out of Scope

- **Tile deletion after seeding:** Tiles are scratch data. Whether to delete them after `build:template` is a separate decision — keeping them allows faster DB rebuilds without re-downloading. For now, leave them on disk (gitignored).
- **Higher zoom levels:** Zoom 6 is sufficient for 0.25° grid. Future plans wanting finer terrain detail can re-download at z7/z8.
- **Terrarium format:** Not used (chose geotiff for library reuse). Could revisit if download size matters.
- **Edge-cell handling at poles/antimeridian:** Exclusive bounds (0..719, 0..1439) mean the exact north pole (lat=90) and antimeridian (lon=180) have no cell. This matches the grid's existing contract (`TERRAIN_LAT_CELLS = 720`, `TERRAIN_LON_CELLS = 1440`).

## Pre-flight Review

No conflicts between tasks. Task 2 (parser) and Task 3 (remove noise) touch different files except `terrain-seed.test.ts` which both rewrite — Task 3 owns that file. Task 1 (download) and Task 2 (parser) change different files. Task 4 (call sites) depends on Task 3's interface change (removed `source` field). Task 5 (verification) depends on all prior tasks.

Execution order: 1 → 2 → 3 → 4 → 5.