# ADR-0021: Unit System & Scaling

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Status     | Proposed                               |
| Date       | 2026-07-08                             |
| Deciders   | Project owner                          |
| Relates to | ADR-0003, ADR-0007, ADR-0014, ADR-0018 |

## Context

The game involves physical quantities — resource masses, distances, power
output, facility capacities, transport flow rates, and time. Without a
consistent unit system, recipe balancing, transport calculations, and
power grid management become ambiguous. "2 Iron Ore + 1 Coal" means nothing
without knowing whether those are kilograms, tons, or abstract "units."

The user wants metric units at human scales (kilograms, kilometers, etc.).

## Decision

### Base Units

All game quantities use **metric units at human-scale magnitudes**:

| Dimension | Unit             | Symbol | Rationale                                                                                                                                     |
| --------- | ---------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Mass      | tonne (metric)   | t      | Industrial scale — a mine doesn't extract 5 kg of iron, it extracts tonnes. Tonne keeps numbers manageable (1-999 range for most quantities). |
| Distance  | kilometer        | km     | Earth-scale distances. A facility-to-facility transport is 10-500 km, not 10,000 m.                                                           |
| Area      | square kilometer | km²    | Deposit coverage, facility footprint.                                                                                                         |
| Volume    | cubic meter      | m³     | Water, oil — where mass is impractical (water density ≈ 1 t/m³, so often interchangeable).                                                    |
| Energy    | megajoule        | MJ     | Power plant output, fuel energy content. 1 MJ = 1 J × 10⁶. Industrial-scale energy.                                                           |
| Power     | megawatt         | MW     | Power generation/consumption rate. MW is natural for plants (coal plant: 50-500 MW).                                                          |
| Time      | tick             | tick   | 1 tick = the simulation time unit (ADR-0006). See Time Scale below.                                                                           |

### Mass Convention

Resource quantities in recipes, stockpiles, and deposits are expressed in
**tonnes** unless the resource is naturally measured by volume:

- **Tonnes**: iron ore, coal, copper ore, stone, lumber, steel, concrete,
  machinery, all elements, all manufactured goods.
- **Cubic meters**: water, oil, natural gas (where volume is the natural
  measure; density conversions happen internally if needed).
- **Count**: population (individuals), vehicles/units, satellites, drones
  (discrete items, not mass).
- **Megawatts**: power capacity (generation, consumption, transmission).

### Recipe Quantities

Recipe inputs/outputs (ADR-0018) use tonnes for mass-based resources and m³
for volume-based resources:

```typescript
interface RecipeInput {
  ResourceKey: string // 'Fe_ore', 'Water'
  Quantity: number // in tonnes (mass) or m³ (volume)
  Unit: Unit // 't' | 'm³' | 'MW' | 'count'
  Optional?: boolean
}
```

Example recipes with units:

| Recipe               | Inputs                                                                    | Outputs               |
| -------------------- | ------------------------------------------------------------------------- | --------------------- |
| Iron Smelting        | 2 t Iron Ore + 1 t Coal + 5 MW·tick power                                 | 2 t Iron + 0.5 t Slag |
| Concrete             | 2 t Limestone + 1 m³ Water                                                | 3 t Concrete          |
| Electronics Assembly | 0.1 t Silicon + 0.05 t Copper + 0.01 t Gold + 0.02 t Plastics + 2 MW·tick | 0.1 t Electronics     |

Power in recipes is expressed as **MW·tick** (energy consumed per cycle),
not instantaneous MW. This makes energy cost explicit per production cycle.

### Transport Flow Rates

Transport links (ADR-0007) move resources at a rate of **tonnes per tick**
(t/tick) or **m³ per tick** for volume resources:

- Road: 10-50 t/tick
- Conveyor: 5-20 t/tick
- Pipeline: 50-200 t³/tick (or t/tick for solids in slurry)
- Power line: 50-500 MW (transmission capacity)

### Power System

Power generation/consumption (ADR-0014) uses MW:

| Plant Type       | Output (MW)      |
| ---------------- | ---------------- |
| Diesel generator | 1-5              |
| Coal plant       | 50-500           |
| Gas plant        | 50-300           |
| Nuclear reactor  | 500-2000         |
| Fusion reactor   | 2000-10000       |
| Solar farm       | 10-100 (daytime) |
| Wind farm        | 5-200            |
| Hydro plant      | 50-500           |

Transmission loss: % per 100 km (e.g., 2%/100 km for power lines).

### Deposit Quantities

Resource deposits (ADR-0003) are measured in tonnes for solid resources:

- Iron ore deposit: 1,000-100,000,000 t
- Gold deposit: 1-1,000 t (gold is rare)
- Coal deposit: 10,000-1,000,000,000 t
- Water source: 1,000-1,000,000,000 m³
- Oil deposit: 1,000,000-1,000,000,000 m³

### Facility Footprints

Facility placement (ADR-0007/0013) uses km² for area and km for radius:

- Extractor: affects 1-10 km² surrounding area
- Farm: 5-50 km² arable land
- Solar farm: 1-20 km²
- Wind farm: 2-50 km²

### Distance & Terrain

Transport distances (ADR-0013) are calculated as great-circle distance in
km. Terrain effects scale by distance:

- Mountain crossing: +50% distance cost (tunnel modifier)
- Ocean crossing: bridge or subsea pipeline distance = actual km

### Time Scale

One tick represents **one day** of game time. This anchors all time-based
calculations:

| Metric              | Per-Tick Rate                   | Rationale                               |
| ------------------- | ------------------------------- | --------------------------------------- |
| Population growth   | ~0.05%/tick                     | ~2% annual growth → daily rate          |
| Wood regeneration   | ~0.01%/tick of standing biomass | Slow regrowth                           |
| Water replenishment | rainfall-based, ~0.1%/tick      | Moderate                                |
| Research progress   | 1 unit per tick per lab         | See ADR-0018                            |
| Construction        | 1 tick = 1 day of construction  | A small facility takes 1-5 ticks (days) |

### Starting Resources

Starting stockpiles (ADR-0009) use the same units:

| Resource        | Easy   | Normal | Hard  |
| --------------- | ------ | ------ | ----- |
| Fuel            | 50 t   | 30 t   | 15 t  |
| Steel           | 100 t  | 50 t   | 25 t  |
| Concrete        | 200 t  | 100 t  | 50 t  |
| Machinery       | 10 t   | 5 t    | 2 t   |
| Food            | 500 t  | 200 t  | 100 t |
| Population      | 1000   | 500    | 200   |
| Energy (stored) | 500 MJ | 200 MJ | 50 MJ |

### Display Formatting

The web UI and MCP responses format units for readability:

- Large numbers: `1.2 kt` (kilotonnes), `1.5 Mt` (megatonnes), `1.2 Gm³`
- Power: `450 MW`
- Distance: `127 km`
- Flow rate: `25 t/tick`
- Energy: `1.2 GJ`

The `Unit` type in `lib/types/` (ADR-0017) enumerates all units:

```typescript
export type MassUnit = 't' | 'kt' | 'Mt'
export type VolumeUnit = 'm³' | 'km³'
export type PowerUnit = 'MW'
export type EnergyUnit = 'MJ' | 'GJ'
export type DistanceUnit = 'km'
export type AreaUnit = 'km²'
export type TimeUnit = 'tick'
export type CountUnit = 'count'
```

### Internal Storage

All quantities are stored as **REAL (floating point)** in SQLite with the
base unit (t, m³, MW, km). Display formatting converts to scaled units (kt,
Mt, GJ) at presentation time. No unit conversion in storage — everything is
base unit.

## Consequences

**Positive:**

- Consistent units make recipe balancing and transport/power math
  verifiable against real-world references.
- Tonnes at industrial scale keep numbers in a readable range (1-999 for
  most recipe quantities).
- Metric units are internationally understood and unambiguous.
- Time scale (1 tick = 1 day) anchors all growth/research rates to
  comprehensible values.
- Unit type in recipes prevents accidental mixing (e.g., treating m³ as t).

**Negative:**

- Some resources are naturally measured by volume, others by mass — the
  code must handle both, adding slight complexity to comparison/aggregation.
- Tonnes are large for some rare elements (gold deposit of 5 t is
  meaningful but the number "5" looks small). Mitigated by context (the
  resource tracker shows scarcity, not just absolute quantity).
- 1 tick = 1 day means long games have high tick counts. Display formatting
  handles this (e.g., "Tick 365 (Year 1)").

## Alternatives Considered

- **Abstract "units" (no real-world basis)**: Rejected — the user wants
  metric units. Abstract units make balancing arbitrary and prevent
  real-world sanity-checking.
- **Kilograms as base**: Rejected — industrial quantities in kg produce
  unwieldy numbers (a coal deposit would be 1,000,000,000,000 kg). Tonnes
  are the standard industrial unit.
- **Variable time scale (tick = undefined)**: Rejected — without a defined
  time scale, population growth and regeneration rates have no grounding.
  1 tick = 1 day is simple and keeps per-tick deltas small.
- **SI base units (kg, m, J, W)**: Rejected — too small for industrial
  scale. MW, km, t, MJ are the natural engineering units.
