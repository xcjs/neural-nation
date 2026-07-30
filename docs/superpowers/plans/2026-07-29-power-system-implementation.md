# Power System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the power grid system so that PowerLine transports connect generators to consumers, enabling smelters/factories/research labs to produce.

**Architecture:** A new `PowerTick` runs between `ConstructionTick` and `ProductionTick` in the tick pipeline. It computes connected components from PowerLine transports, calculates per-grid generation capacity (with solar latitude factor), consumer demand, transmission loss, and brownout/blackout throttle. It writes `powerConnected` and `powerThrottle` to each facility. `ProductionTick` reads these values to gate and scale production.

**Tech Stack:** TypeScript, Drizzle ORM, better-sqlite3, Vitest, Nuxt

## Global Constraints

- Database is SQLite (better-sqlite3) with Drizzle ORM
- Tests use Vitest (`npm run test` = `vitest run`)
- Type checking: `npm run typecheck` = `nuxt typecheck`
- Linting: `npm run lint` = `eslint .`
- Migrations are inlined in `server/db/migrate.ts` (MIGRATIONS array) AND raw SQL in `scripts/build-template.ts`
- Schema is defined in `server/db/schema/` files using Drizzle
- Template DB must be rebuilt after schema changes: `npm run build:template` (but the script skips if file exists — must delete first)
- Tick classes implement `ITick` interface: `process(tick: number): void`
- Tick classes take `GameDb` (transaction) in constructor, query DB directly (not via repositories)
- `GameDb = BetterSQLite3Database<typeof schema>` from drizzle-orm/better-sqlite3

---

## File Structure

**New files:**
- `server/domains/shared/constants/facilityTypes.ts` — shared EXTRACTOR_TYPES, POWER_GENERATING_TYPES, BASE_POWER_CONSUMPTION constants
- `server/domains/power/gridTopology.ts` — pure functions: BFS connected components, solar output factor, footprint area, grid throttle computation
- `server/domains/power/Ticks/PowerTick.ts` — implements ITick, runs before ProductionTick
- `server/domains/power/Ticks/PowerTick.test.ts` — unit tests for PowerTick

**Modified files:**
- `server/db/schema/facility.ts` — add `powerThrottle` column
- `server/db/schema/power.ts` — remove `powerLines` table export
- `server/db/schema/index.ts` — remove `powerLines` from schema object and exports
- `server/db/migrate.ts` — add migration 002 (add powerThrottle column, drop power_lines table)
- `scripts/build-template.ts` — add power_throttle column to facilities CREATE TABLE, remove power_lines CREATE TABLE
- `server/domains/power/Repositories/IPowerRepository.ts` — add PowerLineTransportRow, getAllPowerLineTransports, powerThrottle in PowerFacilityRow
- `server/domains/power/Repositories/PowerRepository.ts` — implement getAllPowerLineTransports, add powerThrottle to getAllFacilities
- `server/domains/power/PowerService.ts` — use getAllPowerLineTransports, use shared BFS from gridTopology
- `server/domains/facilities/FacilityService.ts` — compute powerConsumption at build time, fix throughput bug
- `server/domains/facilities/Repositories/IFacilityRepository.ts` — add powerThrottle to FacilityRow, powerConsumption to BuildFacilityParams
- `server/domains/facilities/Repositories/FacilityRepository.ts` — pass powerConsumption in insertFacility
- `server/domains/facilities/Ticks/ProductionTick.ts` — apply throttle after power gate, pass throttle to processRecipeProduction
- `server/domains/tick/TickProcessor.ts` — insert PowerTick between ConstructionTick and ProductionTick
- `server/db/integration.test.ts` — remove power_lines from expected tables
- `server/domains/game/simulation-chain.test.ts` — replace raw SQL powerConnected workaround with SolarFarm + PowerLine

---

### Task 1: Schema Changes and Migration

**Files:**
- Modify: `server/db/schema/facility.ts`
- Modify: `server/db/schema/power.ts`
- Modify: `server/db/schema/index.ts`
- Modify: `server/db/migrate.ts`
- Modify: `scripts/build-template.ts`

**Interfaces:**
- Produces: `powerThrottle` column on `facilities` table (real, default 1.0, notNull)
- Produces: `power_lines` table removed from schema and template DB
- Produces: Migration 002 in MIGRATIONS array

- [ ] **Step 1: Add powerThrottle to facility schema**

Modify `server/db/schema/facility.ts` — add after `powerConnected` line (line 14):

```typescript
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const facilities = sqliteTable('facilities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  status: text('status').default('Planning').notNull(),
  techRequired: text('tech_required'),
  activeRecipeId: text('active_recipe_id'),
  targetOutputRate: real('target_output_rate').default(0).notNull(),
  powerConsumption: real('power_consumption').default(0).notNull(),
  powerConnected: integer('power_connected').default(0).notNull(),
  powerThrottle: real('power_throttle').default(1).notNull(),
  throughput: real('throughput').default(0).notNull(),
  constructionProgress: real('construction_progress').default(0).notNull(),
  elevation: real('elevation').notNull(),
  terrainClass: text('terrain_class').notNull(),
  footprint: text('footprint'),
  createdAtTick: integer('created_at_tick').notNull(),
});

export const facilityBuffers = sqliteTable('facility_buffers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  facilityId: integer('facility_id').notNull(),
  resourceKey: text('resource_key').notNull(),
  quantity: real('quantity').default(0).notNull(),
  capacity: real('capacity').notNull(),
  unit: text('unit').notNull(),
  direction: text('direction').notNull(),
});
```

- [ ] **Step 2: Remove powerLines from power schema**

Modify `server/db/schema/power.ts` — remove the `powerLines` table, keep `batteryBanks`:

```typescript
import { integer, real, sqliteTable } from 'drizzle-orm/sqlite-core';

export const batteryBanks = sqliteTable('battery_banks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  facilityId: integer('facility_id').notNull(),
  stored: real('stored').default(0).notNull(),
  capacity: real('capacity').notNull(),
});
```

- [ ] **Step 3: Update schema index.ts — remove powerLines**

Modify `server/db/schema/index.ts`:

Change the import line (line 6) from:
```typescript
import { batteryBanks, powerLines } from './power';
```
to:
```typescript
import { batteryBanks } from './power';
```

Remove `powerLines` from the schema object (line 32) and from the exports (line 66).

The schema object should no longer contain `powerLines`. The exports block should no longer export `powerLines`.

- [ ] **Step 4: Add migration 002 to migrate.ts**

Modify `server/db/migrate.ts` — add migration 002 to the MIGRATIONS array after migration 001:

```typescript
const MIGRATIONS: MigrationFile[] = [
  {
    id: 1,
    filename: '001_pollution_grid.sql',
    sql: [
      'CREATE TABLE IF NOT EXISTS pollution_grid (',
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
      '  lat_index INTEGER NOT NULL,',
      '  lon_index INTEGER NOT NULL,',
      '  pollution REAL DEFAULT 0',
      ');',
      'CREATE INDEX IF NOT EXISTS idx_pollution_grid_lat_lon ON pollution_grid(lat_index, lon_index);',
    ].join('\n'),
  },
  {
    id: 2,
    filename: '002_power_throttle.sql',
    sql: [
      'ALTER TABLE facilities ADD COLUMN power_throttle REAL DEFAULT 1 NOT NULL;',
      'DROP TABLE IF EXISTS power_lines;',
    ].join('\n'),
  },
];
```

- [ ] **Step 5: Update build-template.ts — add power_throttle column, remove power_lines table**

In `scripts/build-template.ts`, in the facilities CREATE TABLE block (around line 88), add `power_throttle REAL DEFAULT 1` after `power_connected INTEGER DEFAULT 0`:

```sql
CREATE TABLE IF NOT EXISTS facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT,
  lat REAL,
  lon REAL,
  status TEXT DEFAULT 'UnderConstruction',
  tech_required TEXT,
  active_recipe_id TEXT,
  target_output_rate REAL DEFAULT 0,
  power_consumption REAL DEFAULT 0,
  power_connected INTEGER DEFAULT 0,
  power_throttle REAL DEFAULT 1,
  throughput REAL DEFAULT 0,
  construction_progress REAL DEFAULT 0,
  elevation REAL,
  terrain_class TEXT,
  footprint TEXT,
  created_at_tick INTEGER
);
```

Remove the `power_lines` CREATE TABLE block (lines 147-155 in build-template.ts). Keep `battery_banks`.

- [ ] **Step 6: Rebuild template DB**

Run:
```bash
del data\games\_template.db
npm run build:template
```

Expected: Template DB rebuilt successfully with new schema.

- [ ] **Step 7: Run typecheck to verify schema compiles**

Run: `npm run typecheck`
Expected: PASS (or only pre-existing unrelated errors)

- [ ] **Step 8: Commit**

```bash
git add server/db/schema/facility.ts server/db/schema/power.ts server/db/schema/index.ts server/db/migrate.ts scripts/build-template.ts
git commit -m "feat: add powerThrottle column, drop power_lines table"
```

---

### Task 2: Shared Constants and Grid Topology Utilities

**Files:**
- Create: `server/domains/shared/constants/facilityTypes.ts`
- Create: `server/domains/power/gridTopology.ts`

**Interfaces:**
- Produces: `EXTRACTOR_TYPES` (Set<string>), `POWER_GENERATING_TYPES` (Set<string>), `BASE_POWER_CONSUMPTION` (Record<string, number>)
- Produces: `solarOutputFactor(lat: number): number`
- Produces: `footprintAreaDeg2(footprint: Array<{lat:number;lon:number}>): number`
- Produces: `computeConnectedComponents(facilityIds: number[], edges: Array<{fromFacilityId:number;toFacilityId:number}>): number[][]`
- Produces: `computeGridThrottle(totalCapacity: number, totalDemand: number): { throttle: number; status: GridStatus }`

- [ ] **Step 1: Create shared constants file**

Create `server/domains/shared/constants/facilityTypes.ts`:

```typescript
export const EXTRACTOR_TYPES = new Set([
  'Extractor',
  'Farm',
  'Forestry',
  'WaterPump',
  'Excavator',
  'Dredger',
]);

export const POWER_GENERATING_TYPES = new Set([
  'PowerPlant',
  'SolarFarm',
  'WindFarm',
  'HydroPlant',
  'NuclearReactor',
  'BreederReactor',
  'FusionReactor',
  'BiomassPlant',
  'BiogasPlant',
  'DieselGenerator',
  'CoalPlant',
  'GasPlant',
  'OilPlant',
  'GeothermalPlant',
]);

export const BASE_POWER_CONSUMPTION: Record<string, number> = {
  Extractor: 0,
  Farm: 0,
  Forestry: 0,
  WaterPump: 0,
  Excavator: 0,
  Dredger: 0,
  Smelter: 5,
  Refinery: 5,
  Processor: 3,
  Factory: 10,
  AdvancedFactory: 15,
  ChemicalPlant: 8,
  Storage: 0,
  ResearchLab: 2,
  TerraformingFacility: 20,
  Spaceport: 50,
};
```

- [ ] **Step 2: Create grid topology utilities**

Create `server/domains/power/gridTopology.ts`:

```typescript
import { GridStatus } from '../../../lib/types/power';
import { transmissionLossPercent } from '../../shared/geo/distance';

export function solarOutputFactor(lat: number): number {
  return 0.5 * Math.max(0.1, Math.cos((lat * Math.PI) / 180));
}

export function footprintAreaDeg2(footprint: Array<{ lat: number; lon: number }>): number {
  if (footprint.length < 3)
    return 0;
  let sum = 0;
  for (let i = 0; i < footprint.length; i++) {
    const j = (i + 1) % footprint.length;
    sum += footprint[i]!.lon * footprint[j]!.lat;
    sum -= footprint[j]!.lon * footprint[i]!.lat;
  }
  return Math.abs(sum / 2);
}

export function computeConnectedComponents(
  facilityIds: number[],
  edges: Array<{ fromFacilityId: number; toFacilityId: number }>,
): number[][] {
  const adj = new Map<number, Set<number>>();
  for (const id of facilityIds) {
    adj.set(id, new Set());
  }
  for (const edge of edges) {
    adj.get(edge.fromFacilityId)?.add(edge.toFacilityId);
    adj.get(edge.toFacilityId)?.add(edge.fromFacilityId);
  }

  const visited = new Set<number>();
  const components: number[][] = [];

  for (const id of facilityIds) {
    if (visited.has(id))
      continue;
    const component: number[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current))
        continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of adj.get(current) || new Set()) {
        if (!visited.has(neighbor))
          queue.push(neighbor);
      }
    }
    components.push(component);
  }

  return components;
}

export function computeGridThrottle(
  totalCapacity: number,
  totalDemand: number,
): { throttle: number; status: GridStatus } {
  if (totalDemand <= totalCapacity * 0.9) {
    return { throttle: 1.0, status: GridStatus.Normal };
  }
  if (totalDemand <= totalCapacity) {
    return { throttle: 1.0, status: GridStatus.Brownout };
  }
  return { throttle: totalCapacity / totalDemand, status: GridStatus.Blackout };
}

export function applyTransmissionLoss(
  totalCapacity: number,
  avgEdgeDistanceKm: number,
  maxHops: number,
): number {
  if (avgEdgeDistanceKm <= 0 || maxHops <= 0)
    return totalCapacity;
  const lossDistance = avgEdgeDistanceKm * maxHops;
  const lossPercent = transmissionLossPercent(lossDistance);
  return totalCapacity * (1 - Math.min(0.5, lossPercent));
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/domains/shared/constants/facilityTypes.ts server/domains/power/gridTopology.ts
git commit -m "feat: add shared facility type constants and grid topology utilities"
```

---

### Task 3: PowerRepository Updates

**Files:**
- Modify: `server/domains/power/Repositories/IPowerRepository.ts`
- Modify: `server/domains/power/Repositories/PowerRepository.ts`

**Interfaces:**
- Consumes: `transports` schema table (type='PowerLine')
- Produces: `getAllPowerLineTransports(): PowerLineTransportRow[]` — returns PowerLine transports from transports table
- Produces: `PowerFacilityRow` now includes `powerThrottle: number`

- [ ] **Step 1: Update IPowerRepository**

Modify `server/domains/power/Repositories/IPowerRepository.ts`:

```typescript
import { Token } from '../../ioc/Token';

export interface PowerFacilityRow {
  id: number;
  type: string;
  lat: number;
  lon: number;
  targetOutputRate: number;
  powerConsumption: number;
  powerThrottle: number;
}

export interface PowerLineTransportRow {
  id: number;
  fromFacilityId: number;
  toFacilityId: number;
  type: string;
  capacity: number;
}

export interface IPowerRepository {
  getAllFacilities: () => PowerFacilityRow[];
  getAllPowerLineTransports: () => PowerLineTransportRow[];
}

export const IPowerRepository = new Token<IPowerRepository>('IPowerRepository');
```

- [ ] **Step 2: Update PowerRepository**

Modify `server/domains/power/Repositories/PowerRepository.ts`:

```typescript
import type { GameDb } from '../../../db/client';
import type { IPowerRepository, PowerFacilityRow, PowerLineTransportRow } from './IPowerRepository';
import { eq } from 'drizzle-orm';
import { schema } from '../../../db/schema';

export class PowerRepository implements IPowerRepository {
  constructor(private readonly db: GameDb) {}

  getAllFacilities(): PowerFacilityRow[] {
    return this.db.select({
      id: schema.facilities.id,
      type: schema.facilities.type,
      lat: schema.facilities.lat,
      lon: schema.facilities.lon,
      targetOutputRate: schema.facilities.targetOutputRate,
      powerConsumption: schema.facilities.powerConsumption,
      powerThrottle: schema.facilities.powerThrottle,
    }).from(schema.facilities).all() as PowerFacilityRow[];
  }

  getAllPowerLineTransports(): PowerLineTransportRow[] {
    return this.db.select({
      id: schema.transports.id,
      fromFacilityId: schema.transports.fromFacilityId,
      toFacilityId: schema.transports.toFacilityId,
      type: schema.transports.type,
      capacity: schema.transports.capacity,
    }).from(schema.transports)
      .where(eq(schema.transports.type, 'PowerLine'))
      .all() as PowerLineTransportRow[];
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: May show errors in PowerService.ts (still references old `getAllPowerLines`). Those will be fixed in Task 8.

- [ ] **Step 4: Commit**

```bash
git add server/domains/power/Repositories/IPowerRepository.ts server/domains/power/Repositories/PowerRepository.ts
git commit -m "feat: update PowerRepository to read PowerLines from transports table"
```

---

### Task 4: FacilityService Changes — Power Consumption and Throughput Fix

**Files:**
- Modify: `server/domains/facilities/Repositories/IFacilityRepository.ts`
- Modify: `server/domains/facilities/Repositories/FacilityRepository.ts`
- Modify: `server/domains/facilities/FacilityService.ts`

**Interfaces:**
- Consumes: `BASE_POWER_CONSUMPTION` from `server/domains/shared/constants/facilityTypes.ts`
- Consumes: `footprintAreaDeg2` from `server/domains/power/gridTopology.ts`
- Produces: `BuildFacilityParams` now includes `powerConsumption: number`
- Produces: `FacilityRow` now includes `powerThrottle: number`
- Produces: `getFacilityDetails()` returns actual `facility.throughput` (not `targetOutputRate`)

- [ ] **Step 1: Update FacilityRow and BuildFacilityParams interfaces**

Modify `server/domains/facilities/Repositories/IFacilityRepository.ts`:

Add `powerThrottle: number;` to `FacilityRow` (after `powerConnected`, around line 16):

```typescript
export interface FacilityRow {
  id: number;
  type: string;
  name: string;
  lat: number;
  lon: number;
  status: string;
  techRequired: string | null;
  activeRecipeId: string | null;
  targetOutputRate: number;
  powerConsumption: number;
  powerConnected: number;
  powerThrottle: number;
  throughput: number;
  constructionProgress: number;
  elevation: number;
  terrainClass: string;
  footprint: string | null;
  createdAtTick: number;
}
```

Add `powerConsumption: number;` to `BuildFacilityParams` (after `powerConnected`, around line 61):

```typescript
export interface BuildFacilityParams {
  type: string;
  name: string;
  lat: number;
  lon: number;
  footprint: string;
  status: FacilityStatus;
  techRequired: string | null;
  powerConnected: number;
  powerConsumption: number;
  createdAtTick: number;
}
```

- [ ] **Step 2: Update FacilityRepository.insertFacility to pass powerConsumption**

Modify `server/domains/facilities/Repositories/FacilityRepository.ts` — in `insertFacility` (line 54-73), change the hardcoded `powerConsumption: 0` to `params.powerConsumption`:

```typescript
insertFacility(params: BuildFacilityParams): FacilityRow {
  return this.db.insert(schema.facilities).values({
    type: params.type,
    name: params.name,
    lat: params.lat,
    lon: params.lon,
    status: params.status,
    techRequired: params.techRequired,
    activeRecipeId: null,
    targetOutputRate: 0,
    powerConsumption: params.powerConsumption,
    powerConnected: params.powerConnected,
    throughput: 0,
    constructionProgress: 0,
    elevation: 0,
    terrainClass: 'Plain',
    footprint: params.footprint,
    createdAtTick: params.createdAtTick,
  }).returning().get() as FacilityRow;
}
```

- [ ] **Step 3: Update FacilityService.buildFacility to compute powerConsumption**

Modify `server/domains/facilities/FacilityService.ts`:

Add imports at the top (after existing imports, around line 8):

```typescript
import { BASE_POWER_CONSUMPTION, POWER_GENERATING_TYPES as POWER_GEN_TYPES } from '../shared/constants/facilityTypes';
import { footprintAreaDeg2 } from '../power/gridTopology';
```

Note: The existing `POWER_GENERATING_TYPES` constant in FacilityService.ts (lines 10-25) should be replaced with the import. Remove the local `POWER_GENERATING_TYPES` set definition and use the imported one.

In `buildFacility()` (around line 260), compute powerConsumption before calling insertFacility:

```typescript
    const isPowerGenerating = POWER_GENERATING_TYPES.has(facilityType);

    // Compute power consumption: base per type * footprint area multiplier
    const basePower = BASE_POWER_CONSUMPTION[facilityType] ?? 0;
    const areaDeg2 = footprintAreaDeg2(params.footprint);
    const multiplier = Math.max(1.0, areaDeg2 / 0.0001);
    const powerConsumption = isPowerGenerating ? 0 : basePower * multiplier;

    const facility = this.facilityRepo.insertFacility({
      type: facilityType,
      name: params.name,
      lat: params.lat,
      lon: params.lon,
      footprint,
      status: FacilityStatus.UnderConstruction,
      techRequired: requiredTech ?? null,
      powerConnected: isPowerGenerating ? 1 : 0,
      powerConsumption,
      createdAtTick: tick,
    });
```

- [ ] **Step 4: Fix getFacilityDetails throughput bug**

In `server/domains/facilities/FacilityService.ts`, line 362, change:

```typescript
      throughput: facility.targetOutputRate,
```

to:

```typescript
      throughput: facility.throughput,
```

- [ ] **Step 5: Remove local POWER_GENERATING_TYPES (use shared import)**

In `server/domains/facilities/FacilityService.ts`, remove lines 10-25 (the local `POWER_GENERATING_TYPES` set). The import added in Step 3 already brings it in. Make sure the import name matches — if the shared file exports `POWER_GENERATING_TYPES`, import it directly:

```typescript
import { BASE_POWER_CONSUMPTION, POWER_GENERATING_TYPES } from '../shared/constants/facilityTypes';
```

And remove the separate `POWER_GEN_TYPES` alias import. Use `POWER_GENERATING_TYPES` throughout.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (PowerService.ts may still have errors from Task 3 changes — fix in Task 8)

- [ ] **Step 7: Commit**

```bash
git add server/domains/facilities/Repositories/IFacilityRepository.ts server/domains/facilities/Repositories/FacilityRepository.ts server/domains/facilities/FacilityService.ts
git commit -m "feat: compute powerConsumption at build time, fix throughput display bug"
```

---

### Task 5: PowerTick Implementation

**Files:**
- Create: `server/domains/power/Ticks/PowerTick.ts`
- Create: `server/domains/power/Ticks/PowerTick.test.ts`

**Interfaces:**
- Consumes: `GameDb` (transaction) from `server/db/client`
- Consumes: `ITick` interface from `server/domains/tick/ITick`
- Consumes: `EXTRACTOR_TYPES`, `POWER_GENERATING_TYPES` from `server/domains/shared/constants/facilityTypes`
- Consumes: `solarOutputFactor`, `computeConnectedComponents`, `computeGridThrottle`, `applyTransmissionLoss`, `footprintAreaDeg2` from `server/domains/power/gridTopology`
- Consumes: `greatCircleDistance` from `server/shared/geo/distance`
- Produces: `PowerTick` class implementing `ITick`, with `process(tick: number): void`

- [ ] **Step 1: Write failing test — grid connectivity**

Create `server/domains/power/Ticks/PowerTick.test.ts`:

```typescript
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGame, executeTool } from '../../../../test/helpers';
import { createGameDb, getDataDir } from '../../../db/client';
import { schema } from '../../../db/schema';
import { PowerTick } from './PowerTick';

const result = createGame();
const token = result.token;
const db = createGameDb(token);

afterAll(() => {
  for (const ext of ['', '-shm', '-wal']) {
    try {
      rmSync(resolve(getDataDir(), `${token}.db${ext}`), { force: true });
    }
    catch {
      // ignore
    }
  }
});

function getFacility(id: number) {
  return db.select().from(schema.facilities).where(eq(schema.facilities.id, id)).get();
}

function advanceTicks(count: number) {
  for (let i = 0; i < count; i++) {
    executeTool(token, 'get_game_state', {});
  }
}

function buildFacility(type: string, name: string, lat: number, lon: number) {
  const r = executeTool(token, 'build_facility', {
    type,
    name,
    lat,
    lon,
    footprint: [
      { lat, lon },
      { lat: lat + 0.01, lon },
      { lat: lat + 0.01, lon: lon + 0.01 },
      { lat, lon: lon + 0.01 },
    ],
  });
  return (r.data as { facilityId: number }).facilityId;
}

function buildPowerLine(fromId: number, toId: number) {
  const r = executeTool(token, 'build_transport', {
    type: 'PowerLine',
    fromFacilityId: fromId,
    toFacilityId: toId,
  });
  return (r.data as { transportId: number }).transportId;
}

describe('PowerTick', () => {
  it('powers a smelter connected to a solar farm via PowerLine', () => {
    const solarId = buildFacility('SolarFarm', 'Test Solar', 37.0, -90.0);
    const smelterId = buildFacility('Smelter', 'Test Smelter', 37.01, -90.0);
    advanceTicks(3); // complete construction

    buildPowerLine(solarId, smelterId);
    advanceTicks(1); // run PowerTick

    const smelter = getFacility(smelterId);
    expect(smelter?.powerConnected).toBe(1);
    expect(smelter?.powerThrottle).toBe(1.0);
  });

  it('leaves isolated smelter unpowered', () => {
    const smelterId = buildFacility('Smelter', 'Isolated Smelter', 38.0, -90.0);
    advanceTicks(3);

    const smelter = getFacility(smelterId);
    expect(smelter?.powerConnected).toBe(0);
    expect(smelter?.powerThrottle).toBe(0);
  });

  it('handles multiple independent grids', () => {
    const solarA = buildFacility('SolarFarm', 'Solar A', 39.0, -90.0);
    const smelterA = buildFacility('Smelter', 'Smelter A', 39.01, -90.0);
    const solarB = buildFacility('SolarFarm', 'Solar B', 40.0, -90.0);
    const smelterB = buildFacility('Smelter', 'Smelter B', 40.01, -90.0);
    advanceTicks(3);

    buildPowerLine(solarA, smelterA);
    buildPowerLine(solarB, smelterB);
    advanceTicks(1);

    expect(getFacility(smelterA)?.powerConnected).toBe(1);
    expect(getFacility(smelterB)?.powerConnected).toBe(1);
  });

  it('powers transitively through intermediate facilities', () => {
    const solarId = buildFacility('SolarFarm', 'Trans Solar', 41.0, -90.0);
    const storageId = buildFacility('Storage', 'Trans Storage', 41.01, -90.0);
    const smelterId = buildFacility('Smelter', 'Trans Smelter', 41.02, -90.0);
    advanceTicks(3);

    buildPowerLine(solarId, storageId);
    buildPowerLine(storageId, smelterId);
    advanceTicks(1);

    expect(getFacility(smelterId)?.powerConnected).toBe(1);
  });

  it('self-powers isolated generators', () => {
    const solarId = buildFacility('SolarFarm', 'Iso Solar', 42.0, -90.0);
    advanceTicks(3);

    const solar = getFacility(solarId);
    expect(solar?.powerConnected).toBe(1);
    expect(solar?.powerThrottle).toBe(1.0);
  });

  it('keeps extractors at throttle=1.0 even with no power', () => {
    const extractorId = buildFacility('Extractor', 'Iso Extractor', 43.0, -90.0);
    advanceTicks(3);

    const extractor = getFacility(extractorId);
    expect(extractor?.powerConnected).toBe(0);
    expect(extractor?.powerThrottle).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/domains/power/Ticks/PowerTick.test.ts`
Expected: FAIL — `PowerTick` module not found (doesn't exist yet)

- [ ] **Step 3: Implement PowerTick**

Create `server/domains/power/Ticks/PowerTick.ts`:

```typescript
import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { eq } from 'drizzle-orm';
import { schema } from '../../../db/schema';
import { EXTRACTOR_TYPES, POWER_GENERATING_TYPES } from '../../shared/constants/facilityTypes';
import { applyTransmissionLoss, computeConnectedComponents, computeGridThrottle, solarOutputFactor } from '../gridTopology';
import { greatCircleDistance } from '../../../shared/geo/distance';

interface FacilityPowerRow {
  id: number;
  type: string;
  lat: number;
  lon: number;
  targetOutputRate: number;
  powerConsumption: number;
  powerConnected: number;
  powerThrottle: number;
}

interface PowerLineEdge {
  fromFacilityId: number;
  toFacilityId: number;
}

export class PowerTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(_tick: number): void {
    const facilities = this.db.select({
      id: schema.facilities.id,
      type: schema.facilities.type,
      lat: schema.facilities.lat,
      lon: schema.facilities.lon,
      targetOutputRate: schema.facilities.targetOutputRate,
      powerConsumption: schema.facilities.powerConsumption,
      powerConnected: schema.facilities.powerConnected,
      powerThrottle: schema.facilities.powerThrottle,
    }).from(schema.facilities)
      .where(eq(schema.facilities.status, 'Active'))
      .all() as FacilityPowerRow[];

    const powerLines = this.db.select({
      fromFacilityId: schema.transports.fromFacilityId,
      toFacilityId: schema.transports.toFacilityId,
    }).from(schema.transports)
      .where(eq(schema.transports.type, 'PowerLine'))
      .all() as PowerLineEdge[];

    const facilityIds = facilities.map(f => f.id);
    const components = computeConnectedComponents(facilityIds, powerLines);

    const facilityMap = new Map(facilities.map(f => [f.id, f]));

    for (const component of components) {
      this.processGrid(component, facilityMap, powerLines);
    }
  }

  private processGrid(
    component: number[],
    facilityMap: Map<number, FacilityPowerRow>,
    powerLines: PowerLineEdge[],
  ): void {
    const gridFacilities = component
      .map(id => facilityMap.get(id))
      .filter((f): f is FacilityPowerRow => f !== undefined);

    const generators = gridFacilities.filter(f => POWER_GENERATING_TYPES.has(f.type));
    const consumers = gridFacilities.filter(f => f.powerConsumption > 0);
    const others = gridFacilities.filter(
      f => !POWER_GENERATING_TYPES.has(f.type) && f.powerConsumption === 0,
    );

    if (generators.length === 0) {
      for (const f of gridFacilities) {
        const isGenerator = POWER_GENERATING_TYPES.has(f.type);
        const isExtractor = EXTRACTOR_TYPES.has(f.type);
        this.updateFacility(f.id, isGenerator ? 1 : 0, isExtractor ? 1.0 : 0);
      }
      return;
    }

    let totalCapacity = 0;
    for (const gen of generators) {
      const rated = gen.targetOutputRate || 0;
      if (gen.type === 'SolarFarm') {
        totalCapacity += rated * solarOutputFactor(gen.lat);
      }
      else {
        totalCapacity += rated;
      }
    }

    const totalDemand = consumers.reduce((sum, c) => sum + c.powerConsumption, 0);

    const gridEdges = powerLines.filter(
      e => component.includes(e.fromFacilityId) && component.includes(e.toFacilityId),
    );
    if (gridEdges.length > 0 && generators.length > 0 && consumers.length > 0) {
      let totalDist = 0;
      for (const edge of gridEdges) {
        const from = facilityMap.get(edge.fromFacilityId);
        const to = facilityMap.get(edge.toFacilityId);
        if (from && to) {
          totalDist += greatCircleDistance(from.lat, from.lon, to.lat, to.lon);
        }
      }
      const avgEdgeDist = totalDist / gridEdges.length;
      const maxHops = component.length - 1;
      totalCapacity = applyTransmissionLoss(totalCapacity, avgEdgeDist, maxHops);
    }

    const hasPower = totalCapacity > 0;
    const { throttle } = computeGridThrottle(totalCapacity, totalDemand);

    for (const gen of generators) {
      this.updateFacility(gen.id, 1, 1.0);
    }
    for (const consumer of consumers) {
      this.updateFacility(consumer.id, hasPower ? 1 : 0, hasPower ? throttle : 0);
    }
    for (const other of others) {
      const isExtractor = EXTRACTOR_TYPES.has(other.type);
      this.updateFacility(other.id, hasPower ? 1 : 0, isExtractor ? 1.0 : (hasPower ? throttle : 0));
    }
  }

  private updateFacility(id: number, powerConnected: number, powerThrottle: number): void {
    this.db.update(schema.facilities)
      .set({ powerConnected, powerThrottle })
      .where(eq(schema.facilities.id, id))
      .run();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/domains/power/Ticks/PowerTick.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add server/domains/power/Ticks/PowerTick.ts server/domains/power/Ticks/PowerTick.test.ts
git commit -m "feat: implement PowerTick for grid connectivity and throttle computation"
```

---

### Task 6: Wire PowerTick into TickProcessor

**Files:**
- Modify: `server/domains/tick/TickProcessor.ts`

**Interfaces:**
- Consumes: `PowerTick` from `server/domains/power/Ticks/PowerTick`
- Produces: PowerTick runs between ConstructionTick and ProductionTick

- [ ] **Step 1: Add PowerTick import and call**

Modify `server/domains/tick/TickProcessor.ts`:

Add import (after line 7, the ConstructionTick import):
```typescript
import { PowerTick } from '../power/Ticks/PowerTick';
```

In the tick pipeline (around line 57-59), insert PowerTick between ConstructionTick and ProductionTick:

```typescript
      new ConstructionTick(tx).process(newTick);
      new PowerTick(tx).process(newTick);
      new ProductionTick(tx).process(newTick);
      new TransportFlowTick(tx).process(newTick);
      new ResearchTick(tx).process(newTick);
      new LoseConditionTick(tx).process(newTick);
```

- [ ] **Step 2: Run existing simulation tests to verify no breakage**

Run: `npx vitest run server/domains/game/simulation-core.test.ts`
Expected: PASS (extractors and solar farms still work — they're power-exempt or self-powered)

- [ ] **Step 3: Commit**

```bash
git add server/domains/tick/TickProcessor.ts
git commit -m "feat: wire PowerTick into tick pipeline"
```

---

### Task 7: ProductionTick Throttle Changes

**Files:**
- Modify: `server/domains/facilities/Ticks/ProductionTick.ts`

**Interfaces:**
- Consumes: `EXTRACTOR_TYPES`, `POWER_GENERATING_TYPES` from `server/domains/shared/constants/facilityTypes`
- Consumes: `powerThrottle` column on facilities table
- Produces: `processRecipeProduction` now accepts `throttle: number` parameter and scales `cycles` by it

- [ ] **Step 1: Update imports to use shared constants**

Modify `server/domains/facilities/Ticks/ProductionTick.ts`:

Replace lines 6-22 (local EXTRACTOR_TYPES and POWER_GENERATING_TYPES) with:

```typescript
import { EXTRACTOR_TYPES, POWER_GENERATING_TYPES } from '../../shared/constants/facilityTypes';
```

Remove the local constant definitions.

- [ ] **Step 2: Apply throttle after power gate**

In `ProductionTick.process()`, after the existing power gate (lines 39-45), add throttle logic for powered non-extractor, non-generator facilities:

The full updated `process` method:

```typescript
  process(_tick: number): void {
    const activeFacilities = this.db.select()
      .from(schema.facilities)
      .where(eq(schema.facilities.status, 'Active'))
      .all();

    for (const facility of activeFacilities) {
      const isExtractor = EXTRACTOR_TYPES.has(facility.type);
      const isPowerGenerator = POWER_GENERATING_TYPES.has(facility.type);
      if (!facility.powerConnected && !isExtractor && !isPowerGenerator) {
        this.db.update(schema.facilities)
          .set({ throughput: 0 })
          .where(eq(schema.facilities.id, facility.id))
          .run();
        continue;
      }

      if (isExtractor) {
        this.processExtractorProduction(facility);
      }
      else if (facility.activeRecipeId) {
        const throttle = facility.powerThrottle ?? 1.0;
        if (throttle <= 0) {
          this.db.update(schema.facilities)
            .set({ throughput: 0 })
            .where(eq(schema.facilities.id, facility.id))
            .run();
          continue;
        }
        this.processRecipeProduction(facility, throttle);
      }
      else {
        this.db.update(schema.facilities)
          .set({ throughput: 0 })
          .where(eq(schema.facilities.id, facility.id))
          .run();
      }
    }
  }
```

- [ ] **Step 3: Update processRecipeProduction signature and cycles calculation**

Change the method signature and the `cycles` calculation:

```typescript
  private processRecipeProduction(
    facility: typeof schema.facilities.$inferSelect,
    throttle: number = 1.0,
  ): void {
    const recipeId = facility.activeRecipeId!;

    const inputs = this.db.select().from(schema.recipeInputs).where(eq(schema.recipeInputs.recipeId, recipeId)).all();
    const outputs = this.db.select().from(schema.recipeOutputs).where(eq(schema.recipeOutputs.recipeId, recipeId)).all();

    if (outputs.length === 0)
      return;

    const rate = facility.targetOutputRate || 1;
    const cycles = rate * throttle;
```

The rest of the method stays the same — it uses `cycles` for input consumption and output production.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Run existing simulation tests**

Run: `npx vitest run server/domains/game/simulation-chain.test.ts server/domains/game/simulation-core.test.ts`
Expected: simulation-core PASS. simulation-chain may FAIL because the test still uses raw SQL `powerConnected=1` workaround — that test will be fixed in Task 9.

- [ ] **Step 6: Commit**

```bash
git add server/domains/facilities/Ticks/ProductionTick.ts
git commit -m "feat: apply power throttle to production in ProductionTick"
```

---

### Task 8: PowerService Update

**Files:**
- Modify: `server/domains/power/PowerService.ts`

**Interfaces:**
- Consumes: `getAllPowerLineTransports()` from `IPowerRepository` (Task 3)
- Consumes: `computeConnectedComponents` from `server/domains/power/gridTopology` (Task 2)
- Produces: `getPowerGridStatus()` returns real capacity, demand, and grid status

- [ ] **Step 1: Update PowerService to use getAllPowerLineTransports**

Modify `server/domains/power/PowerService.ts`:

```typescript
import type { PowerGridSummary, PowerLineSummary } from './Models/PowerModels';
import type { IPowerRepository } from './Repositories/IPowerRepository';
import { GridStatus } from '../../../lib/types/power';
import { greatCircleDistance, transmissionLossPercent } from '../../../shared/geo/distance';
import { POWER_GENERATING_TYPES } from '../shared/constants/facilityTypes';
import { computeConnectedComponents } from './gridTopology';

export class PowerService {
  constructor(private readonly powerRepo: IPowerRepository) {}

  getPowerGridStatus(): PowerGridSummary {
    const facilities = this.powerRepo.getAllFacilities();
    const powerLineTransports = this.powerRepo.getAllPowerLineTransports();

    const generators = facilities.filter(f => POWER_GENERATING_TYPES.has(f.type));
    const consumers = facilities.filter(f => f.powerConsumption > 0);

    const totalCapacity = generators.reduce((sum, g) => sum + (g.targetOutputRate || 0), 0);
    const totalDemand = consumers.reduce((sum, c) => sum + c.powerConsumption, 0);

    let status = GridStatus.Normal;
    if (totalDemand > totalCapacity * 0.9)
      status = GridStatus.Brownout;
    if (totalDemand > totalCapacity)
      status = GridStatus.Blackout;

    const lines: PowerLineSummary[] = powerLineTransports.map((line) => {
      const from = facilities.find(f => f.id === line.fromFacilityId);
      const to = facilities.find(f => f.id === line.toFacilityId);

      let loss = 0;
      if (from && to) {
        const dist = greatCircleDistance(from.lat, from.lon, to.lat, to.lon);
        loss = transmissionLossPercent(dist);
      }

      return {
        id: line.id,
        fromFacilityId: line.fromFacilityId,
        toFacilityId: line.toFacilityId,
        capacity: line.capacity,
        load: 0,
        transmissionLoss: loss,
      };
    });

    const connectedComponents = computeConnectedComponents(
      facilities.map(f => f.id),
      powerLineTransports.map(t => ({ fromFacilityId: t.fromFacilityId, toFacilityId: t.toFacilityId })),
    );

    return {
      totalCapacity,
      totalDemand,
      status,
      lines,
      connectedGrids: connectedComponents,
    };
  }
}
```

Key changes:
- Uses `getAllPowerLineTransports()` instead of `getAllPowerLines()`
- Uses `POWER_GENERATING_TYPES` from shared constants instead of inline string matching
- Uses `computeConnectedComponents` from gridTopology instead of private method
- Removed the private `computeConnectedComponents` method (now imported)
- Line summaries use `load: 0` (no load tracking in v1) and compute loss from transport endpoints

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/domains/power/PowerService.ts
git commit -m "feat: update PowerService to read PowerLines from transports table"
```

---

### Task 9: Update Existing Tests

**Files:**
- Modify: `server/db/integration.test.ts`
- Modify: `server/domains/game/simulation-chain.test.ts`

- [ ] **Step 1: Update integration test — remove power_lines from expected tables**

Modify `server/db/integration.test.ts`:

In the `expected` array (line 26-52), remove `'power_lines'` from the list of expected tables.

Add a new test to verify power_throttle column exists:

```typescript
  it('has power_throttle column on facilities with default 1.0', () => {
    const info = db.prepare('PRAGMA table_info(facilities)').all() as Array<{ name: string; dflt_value: string | null }>;
    const col = info.find(c => c.name === 'power_throttle');
    expect(col).toBeDefined();
    expect(col!.dflt_value).toBe('1');
  });

  it('does not have power_lines table', () => {
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='power_lines'`).all();
    expect(tables).toHaveLength(0);
  });
```

- [ ] **Step 2: Update simulation-chain test — replace raw SQL powerConnected workaround**

Modify `server/domains/game/simulation-chain.test.ts`:

In the test `'produces iron when iron ore and coal are available in input buffer'` (line 69-126):

Replace lines 75-79 (the raw SQL `powerConnected=1` workaround) with building a SolarFarm + PowerLine:

```typescript
    // Build a SolarFarm and PowerLine to power the smelter
    const solar = executeTool(token, 'build_facility', {
      type: 'SolarFarm',
      name: 'Test Solar',
      lat: 37.19,
      lon: -90.50,
      footprint: [
        { lat: 37.19, lon: -90.50 },
        { lat: 37.20, lon: -90.50 },
        { lat: 37.20, lon: -90.49 },
        { lat: 37.19, lon: -90.49 },
      ],
    });
    const solarId = (solar.data as { facilityId: number }).facilityId;

    executeTool(token, 'build_transport', {
      type: 'PowerLine',
      fromFacilityId: solarId,
      toFacilityId: smelterId,
    });

    // Set solar generation recipe so the solar farm produces
    executeTool(token, 'set_production_target', {
      facilityId: solarId,
      recipeId: 'solar_generation',
      targetRate: 1,
    });

    // Complete solar farm construction (2 ticks) + power tick
    advanceTicks(3);
```

Also update the first test in the describe block (lines 47-67): the smelter built there also needs power now. Add a SolarFarm + PowerLine after construction completes:

In the test `'builds a Smelter, sets iron_smelting recipe, and verifies input/output buffers'` (line 47-67), after `advanceTicks(3)` (line 53), add:

```typescript
    // Build a SolarFarm and PowerLine to power the smelter
    const solar = executeTool(token, 'build_facility', {
      type: 'SolarFarm',
      name: 'Power Solar 1',
      lat: 37.14,
      lon: -90.50,
      footprint: [
        { lat: 37.14, lon: -90.50 },
        { lat: 37.15, lon: -90.50 },
        { lat: 37.15, lon: -90.49 },
        { lat: 37.14, lon: -90.49 },
      ],
    });
    const solarId = (solar.data as { facilityId: number }).facilityId;
    executeTool(token, 'build_transport', {
      type: 'PowerLine',
      fromFacilityId: solarId,
      toFacilityId: smelterId,
    });
    executeTool(token, 'set_production_target', {
      facilityId: solarId,
      recipeId: 'solar_generation',
      targetRate: 1,
    });
    advanceTicks(3); // solar construction + power tick
```

- [ ] **Step 3: Run all simulation tests**

Run: `npx vitest run server/domains/game/simulation-chain.test.ts server/domains/game/simulation-core.test.ts server/db/integration.test.ts`
Expected: PASS (all tests pass with new power system)

- [ ] **Step 4: Commit**

```bash
git add server/db/integration.test.ts server/domains/game/simulation-chain.test.ts
git commit -m "test: update existing tests for power system, remove raw SQL workaround"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (zero errors)

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS (zero errors, or only pre-existing warnings)

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: ALL tests pass

- [ ] **Step 4: Verify no stale references to power_lines**

Run: `grep -r "powerLines\|power_lines" server/ --include="*.ts" | grep -v node_modules | grep -v ".test." | grep -v "migrate.ts"`
Expected: No matches (all references removed from production code)

- [ ] **Step 5: Commit if any fixes were needed**

If any fixes were needed during verification:

```bash
git add -A
git commit -m "fix: address typecheck/lint issues from power system implementation"
```