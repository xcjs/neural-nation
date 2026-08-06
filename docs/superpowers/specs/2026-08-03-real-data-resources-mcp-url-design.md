# Real-Data Resource System + MCP URL Fix — Design

**Date:** 2026-08-03
**Status:** Approved (pending spec review)
**Branch:** `feature/real-terrain-data`

## Background

Three issues identified during gameplay and code investigation:

1. **MCP URL display bug** — the MCP URL field renders empty when the game URL
   is opened in a new tab. Root cause: the private game token is stored
   exclusively in `sessionStorage`, which is per-tab by HTML spec. The game URL
   carries only the public token, so a new tab cannot recover the private
   token, and `TokenManagement.vue` computes `mcpUrl = ''`.

2. **Synthetic deposit data** — deposits use real USGS MRDS lat/lon/commodity
   locations, but `scaleDepositSize()` and `heuristicGrade()`
   (`scripts/lib/mrds-seed.ts:161,173`) generate quantity and grade from
   crustal-abundance heuristics, not real-world data.

3. **Renewables unextractable** — the 7 renewable resources
   (`wood`, `water`, `arableland`, `biomass`, `solar`, `wind`, `hydro`) are
   seeded with `lat=null, lon=null` (`build-template.ts:536-549`). Because
   `ResourceRepository.findUndiscoveredDepositsWithinRadius` filters by
   bounding box on lat/lon, `surveyRegion` can never find them and extractors
   cannot target them.

A prior session (tick-410 game DB) also reported missing power recipes and
missing silicon/carbon. Investigation showed those findings were based on a
**stale template DB** — the current source seeds 30 recipes (17
manufacturing + 13 power generation) and maps `Quartz`/`Silica`/`Silicon` →
`si`. Rebuilding the template DB resolves that.

## Non-Goals

- Proproprietary deposit-level tonnage/grade data (S&P, Wood Mackenzie) is out
  of scope — licensed data we cannot fetch.
- Redesigning the resource/recipe catalog or adding new manufacturing recipes.
- Changing the private-token-out-of-URL security posture beyond the recovery
  endpoint.

## Fix 1 — MCP URL Bug: Token Recovery Endpoint

### Problem

`sessionStorage` is per-tab. The game URL carries only the public token. New
tab → fresh empty `sessionStorage` → private token unrecoverable →
`TokenManagement.vue:7-9` returns `mcpUrl = ''`.

### Solution

Add a token-recovery endpoint and call it from the client when
`sessionStorage` misses.

**New endpoint:** `POST /api/game/recover-token`
- Input: `{ publicToken: string }`
- Output: `{ privateToken: string, mcpUrl: string }` (or 404 if no game matches)
- Behavior: `gameRepo.findByPublicToken(publicToken)` → return the stored
  private token. No additional auth — the public/private distinction is
  weakened intentionally (acceptable for a game token; the distinction still
  prevents casual URL-sharing from accidentally granting MCP control).

**Server file:** `server/api/game/recover-token.post.ts` (new). Reuses
existing `GameRepository.findByPublicToken` (or adds it if absent).

**Client change:** `components/GameScreen.vue:118-123` — after the
`sessionStorage.getItem` miss, `$fetch('/api/game/recover-token', { method: 'POST', body: { publicToken: token } })`. On success, set
`game.privateToken = res.privateToken` and also write it to `sessionStorage`
so subsequent same-tab reloads are free.

**Secondary fix:** `composables/useMcpClient.ts:26` and
`components/ChatPanel.vue:14-15` — remove the fallback to the public token
(the public token is rejected by `server/api/mcp/sse.get.ts:20`). After Fix 1,
`game.privateToken` is always populated when a game is loaded, so the
fallback is dead code that masks failures. Drop it; if `privateToken` is
empty, surface a clear error instead of silently falling back.

### Files touched

- `server/api/game/recover-token.post.ts` (new)
- `components/GameScreen.vue` (edit ~lines 118-123)
- `composables/useMcpClient.ts` (edit ~line 26)
- `components/ChatPanel.vue` (edit ~lines 14-15)
- Possibly `server/domains/game/GameRepository.ts` (add `findByPublicToken`
  if absent)

### Tests

- `test/recover-token.test.ts` (new): 200 for valid publicToken, 404 for
  unknown, returns the stored private token unchanged.
- Manual: open `/play?token=<public>` in a new tab → MCP URL renders.

## Fix 2 — Real-Data Enrichment (Approach C: Multi-Dataset Model)

Three sub-parts: deposit profiles, USGS MCS production data, and
carbon/silicon byproduct.

### 2a. Deposit Grade/Tonnage Profiles

Replace the synthetic `scaleDepositSize()` and `heuristicGrade()` in
`scripts/lib/mrds-seed.ts` with a commodity-type profile table sourced from
public USGS Professional Papers and published deposit models.

**New file:** `scripts/lib/deposit-profiles.ts`
- Exports `DEPOSIT_PROFILES: Record<string, DepositProfile>` keyed by
  MRDS commodity token (e.g. `'Copper'`, `'Iron'`, `'Gold'`).
- `DepositProfile = { gradeMin, gradeMax, tonnageMin, tonnageMax, unit }`
  — all real-world ranges in tonnes / fraction.
- Exports `resolveProfile(commodityToken: string): DepositProfile | null`
  with the same hyphenated / oxide / sulfide fallbacks as `resolveCommodity`.
- Profiles are hand-curated from public sources:
  - Porphyry copper: 0.4–1.0% Cu, 100–1000 Mt
  - Banded iron formation: 30–35% Fe, 1 Bt+
  - Orogenic gold: 5–10 g/t, 1–10 Mt
  - Coal seam: 50–500 Mt
  - Mississippi-Valley-type lead-zinc: 3–10% combined, 1–50 Mt
  - Sandstone-hosted uranium: 0.1–0.3% U₃O₈, 10–100 Mt
  - Rare-earth: 3–10% REO, 1–50 Mt
  - (Full list in the file.)
- Fallback for unmapped commodities: keep the existing
  crustal-abundance heuristic, clearly marked as a fallback.

**Edit `scripts/lib/mrds-seed.ts`:**
- Replace `scaleDepositSize(abundance)` (line 161) and `heuristicGrade(abundance)`
  (line 173) with calls into `resolveProfile()`. When a profile matches, draw
  grade and tonnage uniformly from the profile range (deterministic via a
  hash of lat/lon, so re-seeding is reproducible). When no profile matches,
  fall back to the existing heuristic.
- The insert loop (lines 246–323) now computes `quantity` and `grade` per row
  from the profile, not from `abundance`.

### 2b. USGS MCS Country-Level Production Data

Supplement MRDS locations with USGS Mineral Commodity Summaries (MCS)
country-level annual production, distributed across that country's MRDS
deposits proportionally to their profiled tonnage. Gives real total tonnage
per commodity per country.

**New files:**
- `scripts/fetch-mcs-data.ts` — downloads the MCS CSV (public USGS data) to
  `data/geological/raw/mcs.csv`.
- `scripts/lib/mcs-seed.ts` — `seedMcsProduction(db, csvPath)`:
  1. Parse country × commodity → tonnes/year.
  2. For each (country, commodity), sum the profiled tonnage of MRDS
     deposits in that country (point-in-country via lat/lon against a
     country-bounds table).
  3. Scale each deposit's `quantity` so the country-commodity total matches
     the MCS production figure × a reserve-factor multiplier (e.g. 100×
     annual production ≈ economic reserve). Smaller deposits keep their
     proportional share.
  4. Idempotent — no-ops if the `resources.mcsAdjusted` column is already set.

**Edit `scripts/build-template.ts`:**
- After `seedMrdsDeposits()` (line 563), call `seedMcsProduction()`.
- Add a `mcsAdjusted INTEGER DEFAULT 0` column to the `resources` table DDL
  (idempotent migration; older DBs get an `ALTER TABLE ADD COLUMN`).

**Country bounds:** ship a small `data/geological/country-bounds.json`
(derived from Natural Earth public domain) — ~250 country polygons. No new
runtime dependency; the seeder reads it once at build time.

### 2c. Carbon/Silicon Byproduct

**Carbon (`c`)** — MRDS lists `Coal`, not `Carbon`. Coal is ~60–80% carbon.
Fix: when an MRDS record maps to `coal`, also insert a `c` deposit row at
the same location with `quantity = coalQuantity × 0.7` and
`grade = 0.7` (mass fraction). This makes the `c` resource available for any
future recipe that needs elemental carbon.

**Silicon (`si`)** — already mapped (`Quartz`/`Silica`/`Silicon` → `si`).
No code change needed. Verify after rebuild that `si` deposits exist.

**Edit `scripts/lib/mrds-seed.ts`:** in the insert loop, after pushing the
primary `coal` row, conditionally push a `c` row with the byproduct
quantity. Add `'c'` to `NON_ELEMENT_NAMES` in `lib/constants/resource-names.ts`
as `'Carbon'` and to `categorizeResource`'s element set (or keep it as
NonRenewable — it is an element by symbol, so add it to the element regex).

### Files touched (Fix 2)

- `scripts/lib/deposit-profiles.ts` (new)
- `scripts/lib/mcs-seed.ts` (new)
- `scripts/fetch-mcs-data.ts` (new)
- `data/geological/country-bounds.json` (new, public-domain)
- `scripts/lib/mrds-seed.ts` (edit profiles + byproduct)
- `scripts/build-template.ts` (edit: wire MCS, add column)
- `lib/constants/resource-names.ts` (add `c`)
- `server/domains/resources/ResourceService.ts` (categorize `c`)

### Tests

- `scripts/lib/deposit-profiles.test.ts`: profiles resolve for known
  commodities; fallback for unknown.
- `scripts/lib/mcs-seed.test.ts`: country totals match MCS after scaling.
- Extend `server/db/integration.test.ts`: after seeding, `c` deposits exist
  and have non-zero quantity; `si` deposits exist.

## Fix 3 — Climate-Distributed Renewable Deposits

Replace the 7 hardcoded null-lat/lon renewables in
`build-template.ts:536-549` with geolocated deposit rows generated from
climate/biome data.

**New file:** `scripts/lib/renewables-seed.ts` —
`seedRenewableDeposits(db): RenewableSeedResult`:

- **Solar** — distributed across high-irradiance zones (Sahara, Arabia,
  Australia, US Southwest, Atacama). Multiple deposits, quantity scaled by
  solar irradiance (use a simple latitude-based irradiance model;
  `solarOutputFactor` already exists in `server/domains/power/gridTopology.ts`).
- **Wind** — distributed across high-wind zones (North Sea, Patagonia, Great
  Plains, Gobi, Antarctica coast). Quantity scaled by wind class (rough
  latitude-based heuristic; no new dataset).
- **Hydro** — distributed across major river basins (Amazon, Congo,
  Yangtze, Mississippi, Ob, Paraná). Quantity scaled by mean discharge
  (hardcoded table of ~20 major rivers with real discharge figures in
  m³/s → MW equivalent).
- **Wood/biomass** — distributed across forested biomes using the existing
  `data/geological/forest-density.json` (Köppen-Geiger). Iterate the forest
  grid; where density > threshold, emit a `wood` and `biomass` deposit with
  quantity proportional to density. This reuses existing data — no new
  dataset.
- **Water** — distributed across major freshwater bodies (great lakes, major
  rivers). Quantity scaled by volume (hardcoded table of ~20 major lakes/rivers
  with real volume in km³ → tonnes).
- **Arable land** — distributed across temperate/tropical agricultural zones
  (use Köppen climate classes: temperate + tropical = arable). Quantity
  scaled by area in the climate class.

Each deposit has real lat/lon so `surveyRegion` finds them and extractors can
target them. The existing `surveyRegion` bounding-box filter works unchanged.

**Edit `scripts/build-template.ts`:** replace lines 536–549 with a call to
`seedRenewableDeposits(db)`.

**Edit `server/domains/resources/ResourceService.ts`:** no change needed —
the category logic already handles these keys as `Renewable`. The
`findUndiscoveredDepositsWithinRadius` query already filters by lat/lon, so
geolocated renewables are discoverable.

### Files touched

- `scripts/lib/renewables-seed.ts` (new)
- `scripts/build-template.ts` (edit ~lines 536-549)
- `data/geological/forest-density.json` (existing, reused)

### Tests

- `scripts/lib/renewables-seed.test.ts`: emits deposits with non-null lat/lon
  for all 7 renewable keys; totals match expected scale.
- Manual: `surveyRegion` on a Sahara location finds a `solar` deposit.

## Fix 4 — Rebuild Stale Game DB

After Fixes 1–3, rebuild `_template.db` and start a fresh game. The existing
tick-410 game DB was built from an old template missing power recipes.

**Steps:**
1. Run `npm run build:template` (or equivalent — verify the script name in
   `package.json`) to regenerate `data/games/_template.db` with the new
   deposit data, recipes, and renewables.
2. The MCP `start_research` / `build_facility` calls in the prior session that
   failed (NuclearReactor, Spaceport) should now succeed in a fresh game
   because `si` deposits and power recipes are present.
3. Delete or archive the stale game DBs under `data/games/*.db` (except
   `_template.db`) — they are not recoverable in-place.

**No code change** — purely a build + data step. Verify via the MCP tools
that a fresh game has: 30 recipes, non-zero `si` and `c` deposits,
geolocated renewables, and a power grid that produces energy when a
SolarFarm's `set_production_target` is called with `solar_generation`.

## Verification

After all fixes:

1. `npm run typecheck` (or `npx tsc --noEmit`) — no type errors.
2. `npm run lint` — no lint errors.
3. `npm run test` (vitest) — all existing tests pass; new tests pass.
4. `npm run build:template` — template DB rebuilds with new deposit data.
5. Manual via MCP: create a fresh game, survey a region, build a SolarFarm,
   set `solar_generation` as its recipe, observe `totalCapacity > 0` in
   `get_power_grid_status`. Survey the Sahara, find a `solar` deposit.
   Open the game in a new tab, observe the MCP URL renders.

## Open Questions

- None. All design decisions resolved via the brainstorming questions.