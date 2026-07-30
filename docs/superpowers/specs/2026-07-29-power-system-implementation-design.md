# Power System Implementation Design

| Field    | Value                          |
| -------- | ------------------------------ |
| Date     | 2026-07-29                     |
| Status   | Approved (brainstormed)        |
| Relates  | ADR-0014, ADR-0022             |

## Problem

The power system described in ADR-0014 is unimplemented. `powerConnected`
is a static build-time flag set to 1 only for generators. Consumers
(Smelter, Factory, etc.) are born with `powerConnected=0` and have no path
to become powered. Building PowerLine transports does nothing to facility
power state. `powerConsumption` is never populated, so grid demand is
always 0 and brownout/blackout never triggers. The `PowerService` reads
from an empty `power_lines` table instead of the `transports` table where
PowerLine transports actually live. `getFacilityDetails` returns
`targetOutputRate` as `throughput` (API display bug).

This makes the game unplayable beyond extractors — smelters, factories,
and all powered facilities can never produce.

## Solution

Implement a `PowerTick` that runs between `ConstructionTick` and
`ProductionTick`. It computes power grid connectivity from PowerLine
transports, calculates per-grid generation capacity (with solar latitude
factor) and consumer demand, applies transmission loss, determines
brownout/blackout throttle, and writes `powerConnected` + `powerThrottle`
to each facility. `ProductionTick` then reads these values to gate and
scale production.

### Design Decisions (from brainstorming)

1. **Full ADR-0014 scope:** connectivity, consumption, brownout/blackout,
   transmission loss. Skip battery storage and weather/intermittent flags.
2. **Read PowerLines from `transports` table** (type='PowerLine'), drop the
   `power_lines` table.
3. **Power consumption = base per facility type * footprint area** (shoelace
   formula, normalized with minimum 1x multiplier).
4. **Brownout:** demand > 90% but <= 100% of capacity → warning state,
   throttle = 1.0 (no production reduction). **Blackout:** demand >
   capacity → proportional throttle = capacity/demand (e.g. 10MW capacity,
   15MW demand → throttle=0.67). Applied per connected grid.
5. **Solar output:** 50% of rated capacity at equator (day/night averaged),
   scaling down with latitude via `cos(lat)` factor (floored at 0.1).
   Wind: constant full output. Fuel-based generators: full rated output.
6. **Transmission loss:** distance-based, 2% per 100km (existing
   `transmissionLossPercent()` helper). Loss compounds along the path to
   the farthest consumer in a grid.

## Architecture

### New Files

#### `server/domains/power/Ticks/PowerTick.ts`

Implements `ITick`. Runs before `ProductionTick` in the tick pipeline.

**`process(tick)` algorithm:**

```
1. Load all Active facilities (id, type, lat, lon, targetOutputRate,
   powerConsumption, powerConnected, powerThrottle)
2. Load all transports where type='PowerLine' (fromFacilityId, toFacilityId)
3. Build adjacency graph (bidirectional edges from PowerLines)
4. Compute connected components via BFS (reuse algorithm from PowerService)
5. For each connected component (grid):
   a. Separate facilities into generators and consumers
      - Generators: types in POWER_GENERATING_TYPES set
      - Consumers: facilities with powerConsumption > 0
      - Extractors/generators are neither consumers nor affected by throttle
   b. Compute effective generation capacity per generator:
      - SolarFarm: targetOutputRate * 0.5 * max(0.1, cos(lat * PI / 180))
      - WindFarm: targetOutputRate * 1.0
      - All other generators: targetOutputRate * 1.0
   c. Compute total grid capacity = sum of all generator effective capacities
   d. Compute total grid demand = sum of all consumer powerConsumption values
   e. Apply transmission loss:
      - For each generator, find shortest path distance (BFS hops * average
        edge distance) to the farthest consumer in the grid
      - Reduce that generator's effective contribution by
        transmissionLossPercent(pathDistanceKm)
      - Recompute total grid capacity after loss
   f. Determine grid status and throttle:
      - totalDemand <= totalCapacity * 0.9 → Normal, throttle = 1.0
      - totalDemand > totalCapacity * 0.9 AND <= totalCapacity → Brownout,
        throttle = 1.0 (warning state, production unaffected)
      - totalDemand > totalCapacity → Blackout, throttle = totalCapacity / totalDemand
        (proportional reduction, e.g. demand=15, capacity=10 → throttle=0.67)
   g. For each facility in the grid:
      - powerConnected = (grid has at least one generator with
        effective capacity > 0) ? 1 : 0
      - powerThrottle = throttle (consumers only; generators and extractors
        get 1.0)
   h. Batch UPDATE facilities set powerConnected, powerThrottle
6. For facilities NOT in any PowerLine-connected grid:
   - Generators: powerConnected = 1 (self-powered), powerThrottle = 1.0
   - Extractors: powerConnected = 0 (they don't need it), powerThrottle = 1.0
   - All other consumers: powerConnected = 0, powerThrottle = 0
   (Isolated consumers have no power source)
```

**Solar latitude factor:**

```typescript
function solarOutputFactor(lat: number): number {
  return 0.5 * Math.max(0.1, Math.cos((lat * Math.PI) / 180));
}
```

At equator (lat=0): 0.5 * 1.0 = 0.5 (50% rated output, day/night averaged).
At lat=45: 0.5 * 0.707 = 0.354 (35.4% rated).
At lat=90 (pole): 0.5 * 0.1 = 0.05 (5% rated, floored).

**Transmission loss along grid paths:**

For simplicity in v1, compute the average distance of all PowerLine edges
in the grid, then multiply by the max BFS hop count from any generator to
any consumer. This gives an approximate "farthest consumer distance" for
loss calculation. The loss applies to the total grid capacity (reduces
effective capacity), not per-consumer.

```typescript
const avgEdgeDist = edges.map(e => greatCircleDistance(...)).reduce(sum) / edges.length;
const maxHops = max BFS distance from any generator to any consumer;
const lossDistance = avgEdgeDist * maxHops;
const lossPercent = transmissionLossPercent(lossDistance);
const effectiveCapacity = totalCapacity * (1 - Math.min(0.5, lossPercent));
```

Loss is capped at 50% to prevent degenerate cases.

### Modified Files

#### `server/db/schema/facility.ts`

Add `powerThrottle` column:

```typescript
powerThrottle: real('power_throttle').default(1).notNull(),
```

#### `server/db/schema/power.ts`

Remove `powerLines` table (drop via migration). Keep `batteryBanks` table
for future use.

#### `server/domains/power/Repositories/IPowerRepository.ts`

Update `PowerLineRow` to match transport fields, or replace with reading
from transports. Add `getAllPowerLineTransports()` that queries
`transports` where `type='PowerLine'`.

```typescript
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
```

#### `server/domains/power/Repositories/PowerRepository.ts`

Replace `getAllPowerLines()` with `getAllPowerLineTransports()`:

```typescript
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
```

Also add `powerThrottle` to `getAllFacilities()` select and to
`PowerFacilityRow`.

#### `server/domains/power/PowerService.ts`

Update `getPowerGridStatus()` to use `getAllPowerLineTransports()` instead
of `getAllPowerLines()`. Map transport rows to the existing
`PowerLineSummary` format. The grid status computation (capacity, demand,
brownout/blackout) stays the same but now reads real demand values since
`powerConsumption` will be populated.

Extract the connected-components BFS into a shared utility or make
`PowerService` and `PowerTick` both use the same helper.

#### `server/domains/facilities/FacilityService.ts`

1. **`buildFacility()`** — compute `powerConsumption` at build time:

```typescript
const basePower = BASE_POWER_CONSUMPTION[facilityType] ?? 0;
const area = footprintArea(params.footprint);
const multiplier = Math.max(1.0, area / 0.0001);
const powerConsumption = isPowerGenerating ? 0 : basePower * multiplier;
```

Pass `powerConsumption` to the insert.

2. **`getFacilityDetails()` line 362** — fix throughput bug:

```typescript
// BEFORE (bug):
throughput: facility.targetOutputRate,
// AFTER (correct):
throughput: facility.throughput,
```

#### `server/domains/facilities/Ticks/ProductionTick.ts`

After the existing power gate (lines 39-45), apply throttle for powered
facilities:

```typescript
// Existing power gate stays the same (lines 36-45)

// After the gate, apply brownout/blackout throttle
if (!isExtractor && !isPowerGenerator) {
  const throttle = facility.powerThrottle ?? 1.0;
  if (throttle <= 0) {
    this.db.update(schema.facilities)
      .set({ throughput: 0 })
      .where(eq(schema.facilities.id, facility.id))
      .run();
    continue;
  }
  // Pass throttle to processRecipeProduction
  this.processRecipeProduction(facility, throttle);
  continue;
}
```

In `processRecipeProduction`, change `cycles` calculation:

```typescript
// BEFORE:
const cycles = rate;
// AFTER:
const cycles = rate * throttle;
```

The `processRecipeProduction` signature changes to accept a `throttle`
parameter (default 1.0 for backward compatibility with the extractor path,
though extractors don't call this method).

#### `server/domains/tick/TickProcessor.ts`

Insert `PowerTick` between `ConstructionTick` and `ProductionTick`:

```typescript
new ConstructionTick(tx).process(newTick);
new PowerTick(tx).process(newTick);       // ← NEW
new ProductionTick(tx).process(newTick);
new TransportFlowTick(tx).process(newTick);
```

#### `server/domains/power/PowerModule.ts`

Register `PowerTick` if needed for DI (though it's instantiated directly in
`TickProcessor`, same as other ticks — likely no DI registration needed).

### Data

#### Base Power Consumption Table

Defined as a constant in `FacilityService.ts` (or a shared constants file):

```typescript
const BASE_POWER_CONSUMPTION: Record<string, number> = {
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
// Generators (all types in POWER_GENERATING_TYPES): 0
```

Values are in MW. A facility with a footprint area of 0.0001 sq deg
(~11km x 11km) draws the base value. Larger footprints draw proportionally
more.

#### Footprint Area Calculation (Shoelace Formula)

```typescript
function footprintArea(footprint: Array<{lat: number; lon: number}>): number {
  if (footprint.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < footprint.length; i++) {
    const j = (i + 1) % footprint.length;
    sum += footprint[i].lon * footprint[j].lat;
    sum -= footprint[j].lon * footprint[i].lat;
  }
  return Math.abs(sum / 2);
}
```

Returns area in square degrees (lon * lat). The normalization factor
`0.0001` means a 0.01° × 0.01° footprint (area = 0.0001) = 1x multiplier.

## Testing

Per ADR-0022, tests use Vitest. Test files are co-located or in `tests/`.

### Unit Tests

#### `server/domains/power/Ticks/PowerTick.test.ts`

Tests `PowerTick` in isolation with a mock or in-memory DB:

1. **Grid connectivity:** Solar farm connected to smelter via PowerLine →
   smelter gets `powerConnected=1`.
2. **Isolated facility:** Smelter with no PowerLine → `powerConnected=0`,
   `powerThrottle=0`.
3. **Multiple grids:** Two separate grids (Solar A → Smelter A, Solar B →
   Smelter B) → each computed independently.
4. **Transitive connection:** Solar → Storage → Smelter (two PowerLines) →
   smelter powered.
5. **Brownout (warning, no throttle):** Grid with 10MW capacity, 9.5MW
   demand → status=Brownout, throttle=1.0 (enough power, just a warning
   state).
6. **Blackout (proportional throttle):** Grid with 10MW capacity, 15MW
   demand → status=Blackout, throttle=10/15=0.67 (production reduced to 67%).
7. **Solar latitude factor:** Solar farm at lat=0 produces 50% rated, at
   lat=60 produces 50% * 0.5 = 25% rated.
8. **Transmission loss:** Grid with long PowerLine (500km) → effective
   capacity reduced by ~10% (2% per 100km).
9. **Extractor exemption:** Extractor in a grid with no generators →
   `powerConnected=0` but `powerThrottle=1.0` (still works, extractors
   are power-exempt).
10. **Generator self-power:** Solar farm with no PowerLines →
    `powerConnected=1`, `powerThrottle=1.0`.
11. **Empty grid (no facilities):** No crash, no errors.

#### `server/domains/facilities/FacilityService.test.ts` (extend existing or new)

1. **Power consumption at build:** Building a Smelter with footprint area
   0.0001 → `powerConsumption = 5` (base * 1x multiplier).
2. **Power consumption scales with area:** Smelter with footprint area
   0.0002 → `powerConsumption = 10` (base * 2x multiplier).
3. **Generator has zero consumption:** SolarFarm → `powerConsumption = 0`.
4. **Extractor has zero consumption:** Extractor → `powerConsumption = 0`.
5. **`getFacilityDetails` returns actual throughput:** Set facility
   throughput to 2.0 via DB, call `getFacilityDetails` → returns 2.0 (not
   `targetOutputRate`).

#### `server/domains/facilities/Ticks/ProductionTick.test.ts` (new or extend)

1. **Throttle scales production:** Smelter with throttle=0.5, inputs
   available → produces half the normal output.
2. **Throttle=0 blocks production:** Smelter with throttle=0 →
   throughput=0, no input consumption.
3. **Extractors ignore throttle:** Extractor with throttle=0 → still
   produces normally.

### Integration Tests

#### `server/domains/game/simulation-chain.test.ts` (update existing)

Replace the raw SQL workaround:

```typescript
// BEFORE (lines 75-79):
db.update(schema.facilities)
  .set({ powerConnected: 1 })
  .where(eq(schema.facilities.id, smelterId))
  .run();

// AFTER: Build a SolarFarm and PowerLine, then run ticks
const solar = executeTool(token, 'build_facility', {
  type: 'SolarFarm', name: 'Test Solar', lat: 37.15, lon: -90.50,
  footprint: [...],
});
const powerLine = executeTool(token, 'build_transport', {
  type: 'PowerLine', fromFacilityId: solar.facilityId, toFacilityId: smelterId,
});
advanceTicks(3); // construction + power tick
```

Test that after PowerTick runs, the smelter has `powerConnected=1` and
produces iron when inputs are available.

#### `server/db/integration.test.ts` (update)

1. Verify `powerThrottle` column exists with default 1.0.
2. Verify `power_lines` table is dropped.
3. Verify `getAllPowerLineTransports()` returns PowerLine transports from
   the `transports` table.

## Migration

A Drizzle migration is needed:

1. Add `powerThrottle` column to `facilities` table (real, default 1.0).
2. Drop `power_lines` table.
3. Update existing facilities: set `powerConsumption` based on type and
   footprint (backfill for facilities built before this change).
4. Update existing facilities: set `powerConnected=1` for all Active
   generators (they already have this, but backfill ensures consistency).

Run via `npm run db:generate` then `npm run db:migrate`.

## Verification

After implementation:

1. `npm run typecheck` passes.
2. `npm run lint` passes.
3. `npm run test` passes (all existing + new tests).
4. In-game: build SolarFarm, build PowerLine to Smelter, advance ticks →
   smelter `powerConnected=1`, produces iron when inputs available.
5. In-game: Smelter with no PowerLine → `powerConnected=0`, no production.
6. `get_power_grid_status` MCP tool returns real capacity, demand, and
   grid status (not all zeros).