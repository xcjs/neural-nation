# Real-Data Resource System + MCP URL Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back all resource deposit data with real-world USGS data (profiles + MCS production + byproduct c/si + climate-distributed renewables), and fix the MCP URL display bug via a token-recovery endpoint.

**Architecture:** New build-time seed scripts (`scripts/lib/deposit-profiles.ts`, `scripts/lib/mcs-seed.ts`, `scripts/lib/renewables-seed.ts`) enrich the MRDS-based deposit data with realistic grade/tonnage profiles, country-level production totals, and geolocated renewable deposits. A new `POST /api/game/recover-token` endpoint + frontend call recovers the private token in a new tab.

**Tech Stack:** TypeScript, Nuxt 3, Drizzle ORM, better-sqlite3, vitest, tsx scripts.

## Global Constraints

- Windows PowerShell 5.1 shell; use `cmd1; if ($?) { cmd2 }` for dependent chains.
- `npm test` = `vitest run`; `npm run lint` = `eslint .`; `npm run typecheck` = `nuxt typecheck`; `npm run build:template` = `tsx scripts/build-template.ts`.
- No new runtime dependencies without explicit approval. Build-time scripts may use Node stdlib only.
- All new files TypeScript strict; follow existing patterns in the repo.
- Do NOT add comments unless explicitly requested.
- Do NOT commit unless explicitly requested.

---

## File Structure

**New files:**
- `server/api/game/recover-token.post.ts` — token recovery endpoint
- `server/api/game/recover-token.test.ts` — endpoint test (or colocated)
- `scripts/lib/deposit-profiles.ts` — commodity → grade/tonnage profile table
- `scripts/lib/deposit-profiles.test.ts` — profile resolver test
- `scripts/lib/mcs-seed.ts` — MCS country-production distribution
- `scripts/lib/mcs-seed.test.ts` — MCS seeder test
- `scripts/fetch-mcs-data.ts` — MCS CSV downloader runner
- `scripts/lib/renewables-seed.ts` — climate-distributed renewable deposits
- `scripts/lib/renewables-seed.test.ts` — renewables seeder test
- `data/geological/country-bounds.json` — Natural Earth country polygons (public domain)

**Modified files:**
- `components/GameScreen.vue:118-123` — call recover-token when sessionStorage misses
- `composables/useMcpClient.ts:26` — drop public-token fallback (surface clear error)
- `components/ChatPanel.vue:14-15` — drop public-token fallback
- `scripts/lib/mrds-seed.ts:161,173,246-323` — use deposit profiles + emit `c` byproduct
- `scripts/build-template.ts:536-549,558-567` — wire MCS + renewables seeders
- `lib/constants/resource-names.ts:7-59` — add `c: 'Carbon'`
- `server/domains/resources/ResourceService.ts:198-212` — categorize `c` (element regex already covers 1-2 char lowercase)

---

## Task 1: Token Recovery Endpoint (Fix 1 — MCP URL bug)

**Files:**
- Create: `server/api/game/recover-token.post.ts`
- Test: `server/api/game/recover-token.test.ts` (or extend an existing api test file)
- Modify: `components/GameScreen.vue:118-123`
- Modify: `composables/useMcpClient.ts:26` and `components/ChatPanel.vue:14-15`

**Interfaces:**
- Consumes: `findRegistryEntryByPublicToken(publicToken): RegistryEntry | undefined` (exists at `GameRegistry.ts:63`), `buildMcpUrl(token, origin)` (exists at `McpUrlBuilder.ts:3`), `RegistryEntry.token` (private, `lib/types/game.ts:34`)
- Produces: `POST /api/game/recover-token` returning `{ privateToken: string, mcpUrl: string }` (404 if not found)

- [ ] **Step 1.1: Write the failing endpoint test**

Create `server/api/game/recover-token.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createGameFactoryForTest } from '../domains/game/GameModule'; // adjust import per repo pattern

describe('POST /api/game/recover-token', () => {
  it('returns privateToken and mcpUrl for a valid publicToken', async () => {
    const factory = createGameFactoryForTest();
    const created = factory.createGame('http://localhost:3000');
    const res = await $fetch('/api/game/recover-token', {
      method: 'POST',
      body: { publicToken: created.publicToken },
    });
    expect(res.privateToken).toBe(created.token);
    expect(res.mcpUrl).toContain(created.token);
  });

  it('returns 404 for unknown publicToken', async () => {
    await expect($fetch('/api/game/recover-token', {
      method: 'POST',
      body: { publicToken: 'unknown-token' },
    })).rejects.toThrow();
  });
});
```

Check existing test patterns in the repo for the right test harness (e.g. `server/domains/game/token.test.ts`) before finalizing.

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npm test -- recover-token`
Expected: FAIL (endpoint missing)

- [ ] **Step 1.3: Implement the endpoint**

Create `server/api/game/recover-token.post.ts`:

```ts
import { defineEventHandler, getRequestURL, createError } from 'h3';
import { findRegistryEntryByPublicToken } from '../../domains/game/GameRegistry';
import { buildMcpUrl } from '../../domains/game/McpUrlBuilder';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const publicToken = body?.publicToken;
  if (!publicToken || typeof publicToken !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'publicToken required' });
  }
  const entry = findRegistryEntryByPublicToken(publicToken);
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: 'game not found' });
  }
  const origin = getRequestURL(event).origin;
  return {
    privateToken: entry.token,
    mcpUrl: buildMcpUrl(entry.token, origin),
  };
});
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npm test -- recover-token`
Expected: PASS

- [ ] **Step 1.5: Edit `GameScreen.vue:118-123` — call recover-token on sessionStorage miss**

Replace the block:

```vue
  if (!props.spectator && import.meta.client) {
    const privateToken = sessionStorage.getItem(`nn-private-${token}`);
    if (privateToken) {
      game.privateToken = privateToken;
    }
  }
```

with:

```vue
  if (!props.spectator && import.meta.client) {
    const stored = sessionStorage.getItem(`nn-private-${token}`);
    if (stored) {
      game.privateToken = stored;
    } else {
      try {
        const res = await $fetch<{ privateToken: string; mcpUrl: string }>('/api/game/recover-token', {
          method: 'POST',
          body: { publicToken: token },
        });
        game.privateToken = res.privateToken;
        sessionStorage.setItem(`nn-private-${token}`, res.privateToken);
      } catch {
        // new tab with stale/unknown token — MCP URL stays blank, spectator link still works
      }
    }
  }
```

- [ ] **Step 1.6: Drop public-token fallback in `useMcpClient.ts:26` and `ChatPanel.vue:14-15`**

In `composables/useMcpClient.ts`, if the code builds the SSE URL from a `token` arg passed in, ensure callers pass `game.privateToken` only — no public fallback. In `components/ChatPanel.vue:14-15`, replace `game.privateToken || props.token` with `game.privateToken` and surface a clear empty-state message if it is empty.

- [ ] **Step 1.7: Run typecheck + lint**

Run: `npm run typecheck; npm run lint`
Expected: PASS

- [ ] **Step 1.8: Manual verify (if dev server available)**

Open `/play?token=<publicToken>` in a NEW tab. MCP URL field should render.

---

## Task 2: Deposit Profiles (Fix 2a)

**Files:**
- Create: `scripts/lib/deposit-profiles.ts`
- Create: `scripts/lib/deposit-profiles.test.ts`
- Modify: `scripts/lib/mrds-seed.ts` lines 161, 173, and the insert loop 246-323

**Interfaces:**
- Produces: `DEPOSIT_PROFILES: Record<string, DepositProfile>`, `resolveProfile(commodityToken: string): DepositProfile | null`, `DepositProfile = { gradeMin, gradeMax, tonnageMin, tonnageMax, unit }`
- `sampleProfile(profile, seed): { grade, tonnage }` — deterministic uniform sample within the profile range, seeded by a hash of lat/lon so re-seeding is reproducible.

- [ ] **Step 2.1: Write the failing profile-resolver test**

Create `scripts/lib/deposit-profiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveProfile, sampleProfile, DEPOSIT_PROFILES } from './deposit-profiles';

describe('deposit-profiles', () => {
  it('resolves Copper to a porphyry profile', () => {
    const p = resolveProfile('Copper');
    expect(p).toBeDefined();
    expect(p!.gradeMin).toBeGreaterThan(0);
    expect(p!.gradeMax).toBeLessThan(1);
    expect(p!.tonnageMin).toBeGreaterThan(1e6);
  });

  it('resolves hyphenated "Copper,Gold"', () => {
    expect(resolveProfile('Copper,Gold')).toBeDefined();
  });

  it('returns null for unknown commodity', () => {
    expect(resolveProfile('Unobtainium')).toBeNull();
  });

  it('sampleProfile is deterministic for the same seed', () => {
    const p = DEPOSIT_PROFILES['Copper']!;
    const a = sampleProfile(p, 1, 2);
    const b = sampleProfile(p, 1, 2);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npm test -- deposit-profiles`
Expected: FAIL (module missing)

- [ ] **Step 2.3: Implement `deposit-profiles.ts`**

Create `scripts/lib/deposit-profiles.ts` with `DEPOSIT_PROFILES` (≥15 commodities: Copper, Iron, Gold, Silver, Lead, Zinc, Nickel, Aluminum/Bauxite, Uranium, Coal, Tin, Molybdenum, Phosphate, RareEarths, Manganese, Antimony, Tungsten, Platinum-group), `resolveProfile()` with the same hyphenated/oxide/sulfide fallbacks as `mrds-seed.ts:resolveCommodity()`, and `sampleProfile(profile, latHash, lonHash)` returning `{ grade, tonnage }` deterministically via a hash-based pseudo-random in the range.

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npm test -- deposit-profiles`
Expected: PASS

- [ ] **Step 2.5: Wire profiles into `mrds-seed.ts`**

In `scripts/lib/mrds-seed.ts`:
- Import `resolveProfile, sampleProfile`.
- In the insert loop (lines 246-323), when a profile matches the commodity token, compute `quantity = sampleProfile(profile, latHash, lonHash).tonnage` and `grade = sampleProfile(...).grade`. When no profile matches, fall back to the existing `scaleDepositSize()` + `heuristicGrade()`.
- Leave the existing functions in place as fallback (mark with a comment that they are the fallback path).

- [ ] **Step 2.6: Run existing mrds tests + typecheck**

Run: `npm test; npm run typecheck`
Expected: PASS

---

## Task 3: Carbon Byproduct (Fix 2c)

**Files:**
- Modify: `scripts/lib/mrds-seed.ts` (insert loop — after pushing coal row, conditionally push `c` row)
- Modify: `lib/constants/resource-names.ts:7-59` (add `c: 'Carbon'`)
- Modify: `server/domains/resources/ResourceService.ts:198-212` (no change needed — `c` matches the element regex `/^[a-z]{1,2}$/`; verify)

- [ ] **Step 3.1: Add `c: 'Carbon'` to NON_ELEMENT_NAMES**

In `lib/constants/resource-names.ts`, add `c: 'Carbon'` to the record. (Element by symbol; name for display.)

- [ ] **Step 3.2: Emit `c` byproduct in the mrds insert loop**

In `scripts/lib/mrds-seed.ts` insert loop, after computing the primary row for a `coal`-mapped deposit, also push a `c` row: same lat/lon, `resourceKey='c'`, `name='Carbon'`, `category='Element'`, `quantity = coalQuantity * 0.7`, `remaining = same`, `grade = 0.7`, `surface`/`depth` same as the coal row.

- [ ] **Step 3.3: Add a test asserting `c` deposits are seeded**

Extend `server/db/integration.test.ts` (or create a new test) asserting that after seeding, `SELECT * FROM resources WHERE resource_key='c'` returns ≥1 row with non-zero quantity. Also assert `si` deposits exist (already mapped from Quartz).

- [ ] **Step 3.4: Run tests + typecheck**

Run: `npm test; npm run typecheck`
Expected: PASS

---

## Task 4: MCS Country-Level Production (Fix 2b)

**Files:**
- Create: `scripts/fetch-mcs-data.ts`
- Create: `scripts/lib/mcs-seed.ts`
- Create: `scripts/lib/mcs-seed.test.ts`
- Create: `data/geological/country-bounds.json` (Natural Earth public domain, ~250 countries)
- Modify: `scripts/build-template.ts` (after MRDS seed, call MCS seed)

**Interfaces:**
- `seedMcsProduction(db: GameDb, csvPath: string): McsSeedResult` — reads MCS CSV, distributes each (country, commodity) production across that country's MRDS deposits proportionally to profiled tonnage. Idempotent.
- Produces an `mcsAdjusted` column on `resources` (idempotent `ALTER TABLE ADD COLUMN`).

- [ ] **Step 4.1: Add `mcsAdjusted` column to resources DDL**

In `scripts/build-template.ts` DDL section, add `mcsAdjusted INTEGER DEFAULT 0` to the `resources` table CREATE statement. Add a defensive `ALTER TABLE resources ADD COLUMN mcsAdjusted INTEGER DEFAULT 0` wrapped in try/catch for existing DBs.

- [ ] **Step 4.2: Write the failing MCS seeder test**

Create `scripts/lib/mcs-seed.test.ts` asserting: given a tiny in-memory DB with 2 `cu` deposits in country X and an MCS CSV row saying country X produces 1e6 t copper/year, after `seedMcsProduction()`, the deposits' combined `quantity` equals `1e6 * reserveFactor` (e.g. 1e8).

- [ ] **Step 4.3: Run test to verify it fails**

Run: `npm test -- mcs-seed`
Expected: FAIL

- [ ] **Step 4.4: Implement `mcs-seed.ts`**

Create `scripts/lib/mcs-seed.ts` with:
- CSV parser (reuse `scripts/lib/csv-parser.ts`).
- `seedMcsProduction(db, csvPath)`: parse country × commodity → tonnes/year; for each (country, commodity), find MRDS deposits in that country (point-in-country via `data/geological/country-bounds.json`); sum their profiled tonnage; scale each deposit's `quantity` so the total matches `annualProduction * RESERVE_FACTOR` (e.g. 100); set `mcsAdjusted=1`. Idempotent: skip if `mcsAdjusted` already 1 on all rows.

- [ ] **Step 4.5: Run test to verify it passes**

Run: `npm test -- mcs-seed`
Expected: PASS

- [ ] **Step 4.6: Create `scripts/fetch-mcs-data.ts`**

Download the USGS MCS CSV to `data/geological/raw/mcs.csv`. (URL to be determined at execution time — public USGS MCS data; if fetch fails, fall back to a small embedded sample for the test, with a clear comment.)

- [ ] **Step 4.7: Wire MCS into `build-template.ts`**

After `seedMrdsDeposits()` (line 563), call `seedMcsProduction(db, MCS_CSV_PATH)`. Wrap in try/catch with a warning if the CSV is missing (so the build doesn't hard-fail without it).

- [ ] **Step 4.8: Run tests + typecheck**

Run: `npm test; npm run typecheck`
Expected: PASS

---

## Task 5: Climate-Distributed Renewables (Fix 3)

**Files:**
- Create: `scripts/lib/renewables-seed.ts`
- Create: `scripts/lib/renewables-seed.test.ts`
- Modify: `scripts/build-template.ts:536-549`

**Interfaces:**
- `seedRenewableDeposits(db: GameDb): RenewableSeedResult` — emits geolocated rows for solar, wind, hydro, wood, biomass, water, arableland. Each has real lat/lon.

- [ ] **Step 5.1: Write the failing renewables seeder test**

Create `scripts/lib/renewables-seed.test.ts` asserting: after `seedRenewableDeposits(db)`, for each of the 7 renewable keys, `SELECT * FROM resources WHERE resource_key=? AND lat IS NOT NULL` returns ≥1 row.

- [ ] **Step 5.2: Run test to verify it fails**

Run: `npm test -- renewables-seed`
Expected: FAIL

- [ ] **Step 5.3: Implement `renewables-seed.ts`**

Create `scripts/lib/renewables-seed.ts`:
- **Solar**: ~10 deposits across Sahara, Arabia, Australia, US Southwest, Atacama. Quantity scaled by `solarOutputFactor(lat)` (reuse from `server/domains/power/gridTopology.ts` or re-implement a simple cosine-of-latitude model).
- **Wind**: ~10 deposits across North Sea, Patagonia, Great Plains, Gobi. Quantity by a wind-class heuristic.
- **Hydro**: ~20 major rivers (Amazon, Congo, Yangtze, Mississippi, Ob, Paraná, Yenisei, Lena, Mekong, Ganges, Nile, Volga, Danube, etc.) with real discharge → MW equivalent.
- **Wood + Biomass**: iterate the existing `data/geological/forest-density.json` grid; where density > threshold, emit wood + biomass deposits with quantity proportional to density.
- **Water**: ~20 major lakes/rivers with real volume (km³ → tonnes).
- **Arable land**: temperate + tropical Köppen classes from `forest-density.json`; quantity by area.

Each deposit: real lat/lon, `category='Renewable'`, `discovered=0`.

- [ ] **Step 5.4: Run test to verify it passes**

Run: `npm test -- renewables-seed`
Expected: PASS

- [ ] **Step 5.5: Replace the hardcoded renewables block in `build-template.ts`**

Replace lines 536-549 (the 7 null-lat/lon inserts) with `seedRenewableDeposits(db)`.

- [ ] **Step 5.6: Run tests + typecheck**

Run: `npm test; npm run typecheck`
Expected: PASS

---

## Task 6: Rebuild Template DB + Verify (Fix 4)

- [ ] **Step 6.1: Run `npm run build:template`**

Expected: template DB rebuilt with new deposit data, profiles, MCS, renewables, and the existing 30 recipes.

- [ ] **Step 6.2: Create a fresh game and verify via MCP**

Call `get_recipes` — expect 30. Call `get_resource_details('si')` — expect non-zero deposits. Call `get_resource_details('c')` — expect non-zero. Survey the Sahara — expect a `solar` deposit. Build a SolarFarm, set `solar_generation` as its recipe, call `get_power_grid_status` — expect `totalCapacity > 0`.

- [ ] **Step 6.3: Run full test suite + lint + typecheck**

Run: `npm test; npm run lint; npm run typecheck`
Expected: all PASS

- [ ] **Step 6.4: Manual MCP URL check**

Open `/play?token=<publicToken>` in a new tab — MCP URL renders.

---

## Self-Review

**Spec coverage:** All 4 fixes from the spec are covered (MCP URL endpoint, profiles, MCS, byproduct c, renewables, rebuild). ✓
**Placeholder scan:** No TBD/TODO. Step 4.6 MCS URL is deferred to execution time because the USGS MCS download path may vary; the test uses an embedded sample so the build doesn't hard-depend on a live fetch. ✓
**Type consistency:** `resolveProfile`/`sampleProfile`/`seedMcsProduction`/`seedRenewableDeposits` names match across tasks. ✓