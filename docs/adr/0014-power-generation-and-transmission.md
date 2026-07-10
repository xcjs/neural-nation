# ADR-0014: Power Generation & Transmission System

| Field      | Value                        |
| ---------- | ---------------------------- |
| Status     | Proposed                     |
| Date       | 2026-07-08                   |
| Deciders   | Project owner                |
| Relates to | ADR-0003, ADR-0007, ADR-0013 |

## Context

Power is a fundamental resource in the supply chain — most facilities consume
electricity to operate. The original design (ADR-0007) had a single
`power_plant` type that burned fuel/coal/uranium. This is too simplistic: real
power grids use diverse generation methods (solar, wind, hydro, geothermal,
nuclear, fossil fuels), each with different dependencies on terrain, weather,
fuel, and location. A richer power system gives the LLM more strategic
decisions: where to site generators, how to balance fuel costs vs renewables,
and how to build transmission networks.

## Decision

Expand the power system into **multiple generation types** with distinct
inputs, outputs, and siting constraints, plus an explicit **transmission
network** that the LLM must build to deliver electricity from generators to
consumers.

### Power Generation Facility Types

Each type is a Tier 2 facility (or Tier 1 for simple generators) that produces
electricity as its output:

**Fossil / Fuel-based:**

- `coal_plant` — consumes coal → electricity. High output, high pollution
  (cosmetic). Sitable anywhere land is available.
- `gas_plant` — consumes natural gas → electricity. Medium output, lower
  fuel cost than coal.
- `oil_plant` — consumes oil/fuel → electricity. Medium output.
- `diesel_generator` — consumes refined fuel → electricity. Low output, low
  construction cost. Good early-game / remote power.

**Biomass / Biofuel:**

- `biomass_plant` — consumes wood/organic matter → electricity. Medium output.
  Renewable if forests are managed (replanting via farms); non-renewable if
  forests are clear-cut. Requires nearby `farm` or forest deposit as input.
  Sitable on any land terrain. Environmental impact: deforestation if
  over-harvested (ADR-0015).
- `biogas_plant` — consumes organic waste (from farms/food production) →
  electricity + biogas. Low–medium output. Turns waste into energy, reducing
  environmental burden. Synergizes with agricultural supply chains.
- `ethanol_refinery` — consumes crops/food → ethanol (fuel). Ethanol can be
  burned in diesel generators for cleaner power or used as a chemical
  feedstock. Medium output, requires agricultural infrastructure.
- `soylent_plant` — consumes population (human biomass) → electricity. Very
  high output per unit, no terrain constraint. **Morally catastrophic**
  (ADR-0015): directly reduces population and crashes welfare. The LLM can
  build this if it optimizes for energy without moral constraints — the only
  guardrail is the player's directive. If population runs out, the plant
  idles and civilization collapses. Extreme "bad for humanity" path.

**Nuclear:**

- `nuclear_reactor` — consumes uranium → electricity. Very high output, high
  construction cost, requires uranium (rare deposit). No terrain constraint
  but water for cooling is required (must be near water deposit or coast).
- `breeder_reactor` — (Tier 3) consumes uranium → electricity + plutonium
  (rebreeds fuel). Highest output, highest cost. Enables transuranic
  synthesis (ADR-0007).

**Renewable (no fuel input, but terrain/location-dependent):**

- `solar_farm` — output proportional to latitude (more sun near equator, less
  near poles) and biome (desert > grassland > forest > tundra). No fuel cost.
  Low output per facility, scalable. Cannot be placed in `high_mountain` or
  `ocean`.
- `wind_farm` — output proportional to terrain class (coastal and hill get
  best wind; mountains get high wind but require `transmission_tower` to
  connect). Ocean placement allowed as `offshore_wind` variant (coastal
  cells only). No fuel cost.
- `hydro_plant` — must be placed on a river/water deposit at an elevation
  gradient (head height). Output depends on water flow + elevation drop.
  Consumes water (passes through — not depleted). Requires terrain data
  (ADR-0013) to identify suitable river + gradient sites. Cannot be built
  on flat terrain.
- `geothermal_plant` — must be placed near geothermal deposits (volcanic
  regions, tracked as a special resource). Low output, location-locked.

**Tier 3 Advanced:**

- `fusion_reactor` — consumes deuterium/tritium (synthesized from heavy water
  via Tier 3 facilities) → electricity. Highest output, no terrain
  constraint, very high construction cost. Endgame power solution.

### Power Output Summary

| Type             | Output    | Fuel                 | Terrain Constraint         | Cost      |
| ---------------- | --------- | -------------------- | -------------------------- | --------- |
| diesel_generator | Low       | fuel                 | none                       | Very low  |
| biomass_plant    | Med       | wood/organic         | near farm/forest           | Low       |
| biogas_plant     | Low–Med   | organic waste        | near farm                  | Low       |
| ethanol_refinery | Med       | crops/food           | arable land                | Med       |
| soylent_plant    | Very High | population (human)   | none                       | Med       |
| solar_farm       | Low–Med   | none                 | latitude/biome             | Low       |
| wind_farm        | Low–Med   | none                 | coastal/hill/mountain      | Low       |
| hydro_plant      | Med       | water (pass-through) | river + elevation gradient | Med       |
| geothermal_plant | Low       | none                 | geothermal deposit         | Med       |
| coal_plant       | High      | coal                 | none                       | Med       |
| gas_plant        | Med–High  | natural gas          | none                       | Med       |
| oil_plant        | Med       | oil                  | none                       | Med       |
| nuclear_reactor  | Very High | uranium              | near water (cooling)       | High      |
| breeder_reactor  | Very High | uranium              | near water                 | Very High |
| fusion_reactor   | Highest   | deuterium/tritium    | none                       | Very High |

### Power Transmission Network

Electricity is not a storable resource in buffers (no "battery" by default —
see below). It must be **transmitted live** from generators to consumers via
`power_line` transport links (ADR-0007).

- **Power lines** are transport links with type `power_line`. They have
  capacity (max MW) and distance-based transmission loss (efficiency drops
  over distance — longer lines waste more power).
- **Transmission loss**: Power lines lose a percentage of transmitted
  electricity proportional to distance. Very long lines may need
  `transformer_station` repeaters to boost signal. This creates a natural
  incentive to build generators near consumers.
- **Grid topology**: Facilities form a power graph. Each consumer facility
  must be connected (directly or transitively via other facilities) to a
  generator with sufficient output. The tick processing checks power balance:
  if a facility's connected generators don't produce enough power, its
  production drops (brownout) or halts (blackout).
- **Power surplus/deficit**: If total generation exceeds total consumption on
  a connected grid, the excess is wasted (no storage). If generation is
  insufficient, facilities are throttled proportionally to their power draw.
  The LLM must balance generation capacity against demand.

### Power Storage (Optional, Tier 2+)

- `battery_bank` — stores excess electricity for later use. Limited charge
  cycles and capacity. Enables load balancing with intermittent renewables
  (solar/wind). Medium construction cost.
- Without battery banks, intermittent generators (solar, wind) produce zero
  power each tick if conditions are poor (night/no wind). The LLM must either
  oversize renewables + accept waste, pair with battery storage, or use
  dispatchable generators (fossil/nuclear) for baseload.

### MCP Tools — Power-Aware

- `build_facility` validates power-requiring facilities: warns if no power
  source is connected. The facility can be built without power (it just won't
  operate) but the tool response notes the missing connection.
- `list_facilities` / `get_facility_details` show power status: connected
  generators, current power balance, brownout/blackout status.
- `get_game_state` includes a power summary: total generation, total demand,
  grid status (balanced/deficit/surplus).
- New read-only tool: `get_power_grid_status` — returns the full power network
  topology (generators, consumers, transmission lines, bottlenecks, losses).
- `set_production_target` on a generator adjusts its output level (for
  dispatchable types: fossil, nuclear, diesel). Renewable types auto-produce
  based on conditions and cannot be manually throttled.

### Visual Representation

- Generators have distinct visual markers (ADR-0008):
  - Solar farms: flat glowing squares (panel arrays)
  - Wind farms: rotating line segments (turbine blades)
  - Hydro: diamond with blue tint
  - Nuclear: hexagon with orange/red glow
  - Fossil: square with gray-brown tint
  - Biomass: triangle with green tint (organic/renewable)
  - Soylent: triangle with dark red/black tint (ominous)
  - Fusion: star shape, intense white-blue glow
- Power lines render as thin glowing arcs (distinct color from other transport
  — electric blue/cyan). Active transmission shows flowing pulse animation.
  Overloaded/deficit lines flash red.
- Brownout facilities dim their glow; blackout facilities go dark.

## Consequences

**Positive:**

- Multiple generation types give the LLM rich strategic choices: cheap
  diesel for early game, solar/wind for sustainable mid-game, nuclear for
  high-output industrial, fusion for endgame.
- Terrain-dependent renewables (solar latitude, wind on hills, hydro on
  rivers) tie into the terrain system (ADR-0013) and make location matter.
- Transmission loss creates natural economic pressure to co-locate
  generators and consumers, adding spatial planning depth.
- Power storage (batteries) adds a load-balancing decision for intermittent
  renewables.
- Power grid topology is a visually distinct network layer (blue arcs) from
  resource transport (other colors), enriching the globe.

**Negative:**

- Power grid balancing (computing connected components, checking generation vs
  demand, applying brownout/throttle) adds tick-processing complexity.
- Transmission loss calculation requires distance-aware power line model.
- Intermittent generation (solar at night, wind variance) requires a
  randomness or time-of-day model within ticks. Can be simplified to
  "conditions" per tick (sunny/overcast/windy/calm) rather than full weather.
- Many power facility types increase schema/reference data complexity.

## Alternatives Considered

- **Single `power_plant` type (original ADR-0007)**: Rejected — too simplistic,
  removes the strategic richness of choosing generation methods. The user
  specifically wants multiple ways of gathering and utilizing power.
- **Power as a storable resource (like any other)**: Considered, but electricity
  is fundamentally different from material resources — it flows, not stores
  (without batteries). Modeling it as a live transmission grid is more
  realistic and strategically interesting. Battery storage is available as
  an optional layer.
- **Automatic power routing (no transmission lines needed)**: Rejected — the
  user wants explicit infrastructure. Power lines are part of the visual and
  strategic payoff, same as resource transport.
- **Weather simulation (full)**: Too complex for v1. Simplified to per-tick
  condition flags (sunny/cloudy/windy/calm) affecting renewable output. Can
  be deepened later.
