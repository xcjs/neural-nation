# ADR-0003: Resource Distribution Model

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0011, ADR-0013, ADR-0015 |

## Context

Natural resources must be distributed across the earth at game start in a way
that feels realistic. The game models the full periodic table of elements plus
bulk natural resources (wood, water, etc.). Distribution is generated once per
game and stored in SQLite.

## Decision

Use **real geological data where available, best-guess approximation
thereafter** to seed resource deposits at lat/lon coordinates.

### Resource Categories

Resources are organized into **three categories** based on their
renewability:

1. **Renewable resources** (regrow/regenerate over time if not over-harvested):
   - Wood (forest density by biome — regrows slowly if not clear-cut)
   - Water (freshwater — replenishes via rainfall/hydrological cycle)
   - Arable land / soil fertility (degrades with over-farming, recovers
     slowly with fallow periods)
   - Biomass / organic matter (crops, food — grown on farms each tick)
   - **Population** (human population — grows realistically based on welfare,
     food, energy, and environmental conditions per ADR-0015. Population is
     a tracked resource even if not consumed as fuel. It grows at a rate
     influenced by welfare metrics and shrins if welfare drops. If population
     reaches zero, the game may end — see ADR-0009/ADR-0015.)
   - Solar / wind / hydro energy potential (not a depletable resource per
     se, but tracked as a renewable capacity per location — solar based on
     latitude, wind on terrain class, hydro on water flow + elevation)

2. **Non-renewable resources** (finite deposits, depleted by extraction):
   - Coal (from real deposit data — does not regenerate)
   - Oil & natural gas (from real deposit data — does not regenerate)
   - Stone, gravel, bulk minerals (quarry resources — effectively finite
     at game scale)
   - Uranium and other radioactive ores (finite, rare)

3. **Periodic table elements** (all 118):
   - **Naturally occurring (~92)**: distributed based on real crustal abundance
     and known deposit locations. These are non-renewable (mined from finite
     deposits) unless synthesized.
   - **Trace / ultra-rare (e.g., technetium, francium, astatine, polonium)**:
     appear in minute quantities at very few locations if they occur naturally
     at all; most have effectively zero natural deposits.
   - **Synthetic / not naturally occurring (~26)**: No natural deposits. Must
     be synthesized in specialized facilities (particle accelerators, breeder
     reactors, etc.) if the player/LLM wants them. Whether each is useful in the
     game's economy is a separate gameplay question.

### Renewable Resource Growth Model

Renewable resources grow at realistic rates each tick:

- **Wood**: Forest cells regenerate at a rate proportional to biome health
  (tropical forest faster than boreal). Over-harvesting reduces forest
  coverage; once coverage drops below a threshold, regeneration stops
  (deforestation collapse — ADR-0015). Sustainable harvesting (below
  regeneration rate) allows indefinite production.
- **Water**: Freshwater deposits replenish based on regional rainfall
  (simplified: biome-dependent rate). Over-extraction can deplete a water
  source faster than it replenishes, causing seasonal/long-term scarcity.
- **Arable land**: Soil fertility degrades with intensive farming and
  recovers slowly with fallow (no farm) periods. Monoculture degrades
  faster; sustainable/s rotational farming preserves fertility.
- **Biomass/crops**: Grown on farms each tick proportional to arable land
  fertility + water availability. Consumed for food, ethanol, or biomass
  fuel. Sustainable if land is managed; depletes soil if over-farmed.
- **Population**: Grows based on a logistic model modulated by welfare
  (food surplus, energy access, clean environment). Growth rate:
  - Base growth: ~2% per tick (simplified, scaled to game pace)
  - + Bonus if food surplus, energy surplus, high welfare
  - − Penalty if pollution high, food deficit, low welfare
  - − Penalty if environment degraded (deforestation, water contamination)
  - If population growth rate goes negative for sustained ticks,
  population declines. Severe decline (to zero) triggers lose condition
  (ADR-0009).
  - Population is not spatially distributed in v1 — it's a global number
  affected by global metrics. Future expansion could regionalize it.

### Data Sources (to be sourced and bundled or downloaded)

Geological datasets are sourced from public/open data. Strategy: **bundle
small datasets in the repo; download large datasets via an npm task.**

- **USGS Mineral Resources Data System (MRDS)**: known mineral deposit
  locations worldwide with commodity types. Dataset is a few MB — bundle
  in repo as compressed JSON.
- **Crustal abundance tables**: standard geochemical data (ppm by element)
  for baseline rarity. Very small (a single table of 118 rows) — bundle in
  repo as a TypeScript constant or JSON.
- **Oil & gas deposit data**: publicly available field locations. Moderate
  size — bundle if under ~5MB compressed, else download via npm task.
- **Forestry / biome data**: FAO or similar for wood density by region.
  Moderate size — bundle or download via npm task.
- **Hydrological data**: for freshwater availability. Often large — download
  via npm task if too big to bundle.

The script `scripts/fetch-geological-data.ts` (outside the Nuxt project) handles
downloading and processing large datasets into the `data/geological/` directory.
See ADR-0011 for the template build pipeline.

### Terrain / Elevation Data (ADR-0013)

In addition to geological resource data, the fetch script also downloads and
processes **terrain elevation data**:

- **SRTM (Shuttle Radar Topography Mission)**: near-global elevation at ~90m
  resolution. Too large to bundle — downloaded and downsampled to a 0.1° × 0.1°
  grid (~840K cells) by the fetch script. Stored as `data/geological/terrain/`
  (gitignored — the downsampled grid is seeded into the template DB instead).
- The downsampled terrain grid is inserted into the `terrain` table during
  template build (ADR-0011).
- Terrain data is consumed by the transport pathfinding system (ADR-0007,
  ADR-0013) and the earth visualization (ADR-0002).

### Generation Algorithm

1. **Deposit seeding**: For each naturally-occurring element and bulk resource,
   load real-world deposit data and place deposits at their actual lat/lon
   coordinates with quantities proportional to real-world reserve estimates
   (scaled to game economy).
2. **Noise fill**: Where real data is sparse or unavailable, use Perlin/Simplex
   noise seeded by element-specific parameters to generate plausible deposits
   that respect biome/climate constraints (e.g., bauxite in tropical regions).
3. **Rarity enforcement**: Element abundance follows real crustal abundance
   ratios — iron and aluminum are common; gold and platinum-group metals are
   rare; helium and tantalum are very rare.
4. **Synthetic elements**: Zero deposits placed. Their existence in the DB
   schema allows for future synthesis facilities.

### Storage Schema (resources table)

```
resources
  id            INTEGER PRIMARY KEY
  game_id       TEXT (token)
  resource_type TEXT  -- 'element' | 'bulk'
  resource_key  TEXT  -- e.g. 'Fe', 'Au', 'wood', 'water'
  name          TEXT  -- 'Iron', 'Gold', 'Wood', 'Water'
  lat           REAL
  lon           REAL
  quantity      REAL  -- estimated extractable units
  depth         REAL  -- surface, shallow, deep (affects extraction difficulty)
  grade         REAL  -- concentration quality (affects extraction rate)
  biome         TEXT  -- associated biome zone
  discovered    INTEGER DEFAULT 0  -- LLM must survey to confirm
```

### "Discovered" Mechanic

Deposits exist in the DB at game start but are marked `discovered = 0`. The LLM
must use MCP survey/exploration tools to discover deposits before building
extractors. This gives the LLM a meaningful exploration loop and prevents it from
trivially optimizing from full knowledge.

## Consequences

**Positive:**
- Real-world data makes the earth feel authentic; players recognize that "gold
  is in South Africa" etc.
- Full periodic table allows deep supply chains (ore → metal → alloy →
  component).
- Synthetic elements create an endgame research/synthesis goal.

**Negative:**
- Data compilation effort is significant; need to bundle geological datasets
  with the game.
- 118-element schema with real coordinates is a large initial dataset per game.
- Some elements will have extremely limited gameplay utility — acceptable for
  realism but adds DB rows with no gameplay value.

## Alternatives Considered

- **Simplified periodic table**: Rejected — player specifically wants the full
  table with real geological accuracy.
- **Pure procedural noise**: Rejected — loses the "I recognize that region"
  factor that real data provides.
- **Full geochemical model** (decay chains, ore mineral associations): Too deep
  for v1; can be layered on later without schema changes.