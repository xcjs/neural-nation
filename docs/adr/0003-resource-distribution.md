# ADR-0003: Resource Distribution Model

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |

## Context

Natural resources must be distributed across the earth at game start in a way
that feels realistic. The game models the full periodic table of elements plus
bulk natural resources (wood, water, etc.). Distribution is generated once per
game and stored in SQLite.

## Decision

Use **real geological data where available, best-guess approximation
thereafter** to seed resource deposits at lat/lon coordinates.

### Resource Categories

1. **Bulk natural resources** (non-element):
   - Wood (forest density by biome)
   - Water (freshwater, based on real hydrology)
   - Arable land / soil fertility
   - Coal (from real deposit data)

2. **Periodic table elements** (all 118):
   - **Naturally occurring (~92)**: distributed based on real crustal abundance
     and known deposit locations.
   - **Trace / ultra-rare (e.g., technetium, francium, astatine, polonium)**:
     appear in minute quantities at very few locations if they occur naturally
     at all; most have effectively zero natural deposits.
   - **Synthetic / not naturally occurring (~26)**: No natural deposits. Must
     be synthesized in specialized facilities (particle accelerators, breeder
     reactors, etc.) if the player/LLM wants them. Whether each is useful in the
     game's economy is a separate gameplay question.

### Data Sources (to be compiled)

- **USGS Mineral Resources Data System (MRDS)**: known mineral deposit
  locations worldwide with commodity types.
- **Crustal abundance tables**: standard geochemical data (ppm by element)
  for baseline rarity.
- **Oil & gas deposit data**: publicly available field locations.
- **Forestry / biome data**: FAO or similar for wood density by region.
- **Hydrological data**: for freshwater availability.

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