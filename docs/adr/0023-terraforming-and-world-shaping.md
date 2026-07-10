# ADR-0023: Terraforming & World Shaping

| Field      | Value                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Status     | Proposed                                                                                 |
| Date       | 2026-07-08                                                                               |
| Deciders   | Project owner                                                                            |
| Relates to | ADR-0002, ADR-0003, ADR-0007, ADR-0008, ADR-0011, ADR-0013, ADR-0015, ADR-0018, ADR-0021 |

## Context

ADR-0013 establishes a static terrain elevation grid — real SRTM data
downsampled to 0.1° cells, stored in the template DB, consulted by transport
pathfinding and facility placement, and rendered as the wireframe earth's
surface geometry. This terrain is immutable; the agent can build tunnels and
bridges to _overcome_ terrain but cannot _change_ it.

The user wants the agent to be able to **shape the world**: alter terrain
elevation, create or fill bodies of water, flatten mountains, dig canals,
build artificial land. Over long periods of play, the earth could evolve to
look very different from its starting state — continents reshaped, new lakes
created, mountains leveled, coastlines extended. This is a profound capability
that makes the world feel like a living, agent-modified place rather than a
static backdrop.

Terraforming introduces several design challenges:

- **Data model**: The terrain grid (ADR-0013) must become mutable per-game
  rather than static template data. Modifications must be tracked separately
  from the base terrain and applied as overlays.
- **Scope and progression**: Terraforming should not be available from the
  start — it's a late-game capability requiring significant technology and
  resources. Leveling a mountain range should be a major industrial project,
  not a casual action.
- **Visual feedback**: The wireframe earth mesh must update dynamically as
  terrain changes — mountains flattened should visibly lower, canals dug
  should appear as water-colored depressions, artificial land should rise
  from the ocean.
- **Environmental consequences**: Massive terrain alteration has ecological
  consequences (ADR-0015) — flooding valleys, destroying biomes, altering
  water flow, climate impacts.
- **Gameplay impact**: Terraforming changes transport constraints (new routes
  become possible), facility placement options (new land available), and
  resource accessibility (buried deposits exposed, others buried).

## Decision

Introduce a **terraforming system** with tiered capabilities, resource costs,
tech prerequisites, and environmental consequences. The terrain grid becomes
mutable per-game via a `terrain_modifications` overlay table; the effective
terrain at any cell is the base elevation plus accumulated modifications.

### Terraforming Actions

Terraforming is performed via dedicated MCP tools and specialized facilities.
Each action modifies the terrain grid within a defined area.

**Tier 1 — Early Earthworks (available with Basic Construction tech):**

| Action                  | Description                                                        | Effect                                                                                  | Cost Scale                                  |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| `flatten_terrain`       | Level a small area for construction or agriculture                 | Reduces elevation variance within target cells to the average; lowers hills, fills dips | Machinery + Fuel, ∝ area × elevation change |
| `dig_canal`             | Excavate a channel to connect water bodies or create a water route | Creates a narrow strip of ocean-class cells through land; enables water transport       | Machinery + Fuel, ∝ length × depth          |
| `build_road_embankment` | Raise low terrain for road stability                               | Slightly elevates target cells                                                          | Machinery + Stone                           |

These are small-scale, cell-level modifications (1-10 cells per action).
They use existing facility outputs (Machinery, Fuel, Stone) and require
existing tech (Basic Construction). The agent can use these early to optimize
transport routes or prepare building sites.

**Tier 2 — Hydraulic Engineering (requires Hydraulic Engineering tech):**

| Action             | Description                                     | Effect                                                                         | Cost Scale                                  |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------- |
| `create_reservoir` | Dam a river valley to create an artificial lake | Fills a basin with water-class cells; provides water storage + hydro potential | Concrete + Machinery + Steel, ∝ dam size    |
| `drain_area`       | Pump water out of a shallow area to create land | Converts shallow ocean/coastal cells to land; enables coastal expansion        | Concrete + Machinery + Fuel, ∝ area × depth |
| `divert_river`     | Change river course                             | Alters water-class cell layout; impacts downstream water availability          | Concrete + Machinery, ∝ diversion length    |

**Tier 3 — Large-Scale Terraforming (requires Advanced Terraforming tech):**

| Action                | Description                                                       | Effect                                                                                | Cost Scale                                                  |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `level_mountain`      | Systematically reduce a mountain range                            | Lowers mountain/high_mountain cells to hill/plain over multiple operations            | Machinery + Explosives + Fuel, ∝ area × elevation reduction |
| `raise_land`          | Create new land mass from ocean                                   | Elevates ocean cells above sea level; creates artificial islands or coastal extension | Stone + Concrete + Steel, ∝ area × elevation gain           |
| `excavate_mine_shaft` | Deep excavation to access buried deposits                         | Lowers elevation significantly at a cell; may expose previously inaccessible deposits | Machinery + Fuel, ∝ depth                                   |
| `create_mountain`     | Build artificial elevated terrain (for wind, defense, aesthetics) | Raises elevation at target cells                                                      | Stone + Concrete + Machinery, ∝ volume                      |

**Tier 4 — Planetary Engineering (requires Planetary Engineering tech):**

| Action                            | Description                                               | Effect                                                                | Cost Scale                                             |
| --------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| `shift_continental_plate`         | Massive-scale terrain alteration across hundreds of cells | Changes elevation across a large region; extremely expensive and slow | Massive resource cost, multiple facilities, many ticks |
| `ocean_to_land` / `land_to_ocean` | Large-scale conversion of terrain class                   | Changes biomes, water availability, and climate across a region       | Massive resource cost                                  |

Tier 4 actions are the "world looks very different" tier — they take many
ticks, consume enormous resources, and have significant environmental impact.
They represent the agent reshaping the planet at geological scale.

### Terraforming Facilities

Terraforming is performed by specialized facilities, not by abstract MCP
calls alone:

- **`excavator`** (Tier 1): Performs flatten, dig_canal, road_embankment.
  Placed on land, consumes Machinery + Fuel per operation.
- **`dredger`** (Tier 2): Performs reservoir, drain, divert_river operations.
  Placed on or near water, consumes Concrete + Machinery + Fuel.
- **`terraformer`** (Tier 3): Performs level_mountain, raise_land,
  excavate_shaft, create_mountain. Large facility, requires Advanced
  Terraforming tech. Consumes Machinery + Explosives + Fuel + Stone/Concrete.
- **`planetary_engine`** (Tier 4): Performs continental-scale operations.
  Requires Planetary Engineering tech. Enormous construction cost. Must be
  powered by a fusion reactor (ADR-0014). Consumes vast resources per
  operation.

The LLM builds a terraforming facility, then issues terraforming commands
that the facility executes over time (like a recipe — the "recipe" output is
a terrain modification, not a manufactured resource).

### Terraforming as Recipes

Terraforming operations are modeled as **recipes** (ADR-0018) executed by
terraforming facilities:

```typescript
interface TerraformingRecipe {
  Id: string // 'FlattenTerrain', 'DigCanal', 'LevelMountain'
  Name: string
  FacilityType: FacilityType // 'Excavator', 'Dredger', 'Terraformer', 'PlanetaryEngine'
  Inputs: RecipeInput[] // Machinery, Fuel, Stone, Concrete, etc.
  TargetCells: CellRange // area to modify
  ElevationChange: number // meters to add/subtract (negative = lower)
  NewTerrainClass?: TerrainClass // if class changes (e.g., land → ocean)
  CraftTime: number // ticks to complete
  TechRequired: string // tech node prerequisite
}
```

This integrates terraforming into the existing recipe/tech system — the
agent researches terraforming techs, builds terraforming facilities, and
executes terraforming recipes just like production recipes.

### Terrain Modification Data Model

The base terrain grid (from template DB, ADR-0011) is **immutable**. Per-game
modifications are tracked as an **overlay**:

```
terrain_modifications
  id              INTEGER PRIMARY KEY
  game_id         TEXT              -- token
  lat_index       INTEGER           -- grid row
  lon_index       INTEGER           -- grid col
  elevation_delta REAL             -- change in meters (can be negative)
  new_terrain_class TEXT NULL       -- if class changed from base
  modified_by     TEXT              -- facility ID that made the change
  modified_at_tick INTEGER           -- tick when modification was applied
  operation_id    TEXT              -- grouping: which terraforming operation
  reason          TEXT              -- 'flatten', 'canal', 'reservoir', etc.
```

**Effective terrain** at any cell = base `terrain.elevation_m` + sum of all
`terrain_modifications.elevation_delta` for that cell. If
`new_terrain_class` is set, it overrides the base class. This overlay model:

- Preserves the original terrain (can be referenced for "what was here before")
- Allows undo/reversal (a modification can be counteracted)
- Keeps the template DB static (modifications are per-game state)
- Enables history tracking (what the agent changed and when)

Multiple modifications can accumulate on the same cell over time (e.g., a
mountain is lowered by 500m, then later lowered another 300m).

### Transport & Facility Impact

When terrain changes, dependent systems must re-evaluate:

- **Transport links**: Existing transport links crossing modified cells are
  re-evaluated. If a mountain is leveled, the road through it no longer
  needs a tunnel (the tunnel becomes redundant but isn't auto-demolished).
  If new terrain blocks a path (e.g., a canal floods a road), the transport
  link may become impassable and the LLM is notified.
- **Facility placement**: Newly created land cells (raised from ocean) can
  host facilities. Leveled mountain cells become buildable without the
  mountain cost multiplier. Drained ocean cells become land.
- **Resource deposits**: Terraforming can expose or bury deposits. Digging
  a canal through a mineral deposit area may make it accessible. Raising
  land over a deposit may require re-surveying. `excavate_mine_shaft` can
  access deeper deposits not reachable by surface mines.
- **Water availability**: Creating a reservoir adds a water source. Draining
  an area removes water. Diverting a river changes downstream water
  deposits (may reduce or enhance them).

### Environmental Consequences (ADR-0015)

Terraforming has significant environmental impact, tracked per ADR-0015:

| Operation         | Pollution              | Forest                     | Water Quality                | Biodiversity                  |
| ----------------- | ---------------------- | -------------------------- | ---------------------------- | ----------------------------- |
| Flatten terrain   | +low                   | -low (if forested)         | 0                            | -low                          |
| Dig canal         | +low                   | 0                          | -low (turbidity)             | -low (habitat disruption)     |
| Create reservoir  | +low                   | -medium (flooded valley)   | -low (stagnation)            | -medium (aquatic disruption)  |
| Drain area        | +medium                | 0                          | -medium (altered hydrology)  | -high (wetland loss)          |
| Divert river      | +low                   | -low                       | -high (downstream)           | -high                         |
| Level mountain    | +high (dust, blasting) | -high (if forested slopes) | -medium (runoff)             | -high (habitat destruction)   |
| Raise land        | +medium                | 0                          | -medium (coastal alteration) | -high (marine habitat buried) |
| Excavate shaft    | +low                   | 0                          | -low (groundwater)           | 0                             |
| Create mountain   | +medium                | 0                          | 0                            | -low (new habitat)            |
| Continental shift | +extreme               | -extreme                   | -extreme                     | -extreme (biome shift)        |

Large-scale terraforming can trigger environmental incidents (ADR-0015):

- **Ecological collapse**: If terraforming destroys a biome (e.g., draining
  a major wetland, leveling a forested mountain range), the biome's
  biodiversity may collapse, affecting population welfare.
- **Climate shift**: Large-scale terrain alteration can alter regional
  climate patterns (a mountain range blocking weather is removed →
  downwind areas become drier). This is modeled via the climate shift
  incident threshold.
- **Water contamination**: Excavation can release contaminants into water
  systems; reservoirs can become stagnant.

The `get_impact_forecast` tool (ADR-0015) projects terraforming consequences
before the agent commits, so the LLM can make informed decisions.

### Tech Tree Integration (ADR-0018)

New tech nodes added to the tech tree:

```
[Basic Construction] (starting tech)
  └── Earthworks
      → Excavator facility
      → Flatten, Dig Canal, Road Embankment recipes
          │
          ▼
  Hydraulic Engineering
      → Dredger facility
      → Reservoir, Drain, Divert recipes
          │
          ▼
  Advanced Terraforming
      → Terraformer facility
      → Level Mountain, Raise Land, Excavate Shaft, Create Mountain recipes
          │
          ▼
  Planetary Engineering
      → Planetary Engine facility
      → Continental Shift, Ocean↔Land Conversion recipes
      (Requires Fusion Power — ADR-0014 — for energy needs)
```

These nodes fit into the existing tech tree (ADR-0018) as a new **Terraforming
Branch** alongside Metallurgy, Chemistry, Power, and Space. The branch
starts from Basic Construction (a starting tech) and progresses through
research.

### MCP Tools

New terraforming MCP tools (ADR-0004):

- **`terraform(action, params)`** — Execute a terraforming operation.
  Parameters include the action type (flatten, dig_canal, level_mountain,
  etc.), target cell range (lat/lon bounds or center + radius), and the
  facility ID of the terraforming facility to perform the work. Returns
  cost estimate, environmental impact forecast, and estimated completion
  tick. The operation begins consuming resources per tick like a recipe.
- **`get_terrain_modifications(limit, offset)`** — List terrain
  modifications made in this game (paginated per ADR-0019). Shows what the
  agent has changed and when.
- **`get_effective_terrain(lat, lon)`** — Read the effective terrain at a
  location (base + modifications). Useful for planning transport or
  facility placement after terraforming.
- **`get_terraform_cost_estimate(action, params)`** — Preview the resource
  cost and environmental impact of a terraforming operation before
  committing. Returns: resource costs, estimated ticks, environmental deltas
  (pollution, forest, water, biodiversity), and any incidents that would
  be triggered.

`get_terrain_path` (ADR-0013) uses effective terrain (base + modifications),
so terraforming automatically improves transport planning.

### Visualization (ADR-0002, ADR-0008)

**Dynamic terrain mesh**: The wireframe earth's IcosahedronGeometry vertices
are displaced by **effective** elevation (base + modifications). When
terrain changes, the affected vertices animate to their new positions over
~1-2 seconds (smooth transition, not instant pop). This makes terraforming
visually satisfying — the player watches mountains lower, canals fill with
water, land rise from the sea.

**Visual cues:**

- **Active terraforming**: The terraforming facility emits a distinctive
  particle cloud — earth-toned particles (brown/amber) that churn and
  swirl violently during active operations. Density ∝ operation scale.
- **Modified terrain**: Changed cells get a subtle outline or color shift
  to distinguish them from natural terrain — slightly warmer/different hue
  than base terrain wireframe. Fades over many ticks as it "naturalizes."
- **Water creation**: New water cells (canals, reservoirs) appear with the
  blue ocean glow, animating in as the water "fills."
- **Land creation**: Raised land appears with the land wireframe color,
  animating upward as it rises.
- **Continental-scale operations**: The affected region shows a dramatic
  visual disturbance — massive particle clouds, wireframe distortion,
  warning markers — during the operation. The result is a visibly altered
  continent.
- **Undo/reversal**: If terrain is restored (e.g., a drained area re-flooded),
  the visual reverses smoothly.

**Terrain modification history overlay**: Optional toggle in the UI that
shows all modified cells highlighted, color-coded by operation type. Lets
the player see at a glance how the agent has reshaped the world.

### Long-Term World Divergence

Over hundreds or thousands of ticks, the earth can look dramatically
different:

- Mountains leveled into plains
- New seas created by canal networks or reservoirs
- Artificial islands and extended coastlines
- Continents reshaped by planetary engineering
- Original terrain is preserved in the base grid for reference

The `get_terrain_modifications` tool and the visual history overlay let the
player see the journey from original Earth to the agent's reshaped world.

## Consequences

**Positive:**

- Terraforming gives the agent a deeply satisfying late-game capability —
  the world is not static, it's a canvas the agent shapes over time.
- Tiered progression (earthworks → hydraulic → advanced → planetary) creates
  natural mid- and late-game goals with escalating scale and cost.
- Environmental consequences (ADR-0015) add moral/strategic depth — leveling a
  mountain is easy mechanically but devastating ecologically.
- Integration with the recipe system (ADR-0018) keeps terraforming consistent
  with the rest of the game's mechanics (facility executes recipe → output is
  terrain change).
- The overlay model preserves original terrain data and modification history.
- Dynamic mesh updates make terraforming visually rewarding.

**Negative:**

- Significant implementation complexity: dynamic terrain mesh updates,
  overlay resolution, transport re-evaluation on terrain change, facility
  re-evaluation, deposit accessibility changes.
- Performance: updating the mesh for large-scale terraforming (hundreds of
  cells) requires careful buffer management — cannot rebuild the entire
  geometry per frame. Must update only affected vertices.
- The terrain_modifications table grows over long games — needs efficient
  querying (indexed by lat_index, lon_index).
- Balancing terraforming costs and environmental impact requires playtesting
  — too cheap and the agent reshapes everything immediately; too expensive
  and it's never worth doing.
- The LLM must understand terraforming constraints and consequences — MCP
  tools must provide clear cost/impact forecasts.
- Continental-scale operations could fundamentally alter transport networks
  and facility viability in ways the agent didn't anticipate — the system
  must handle cascading effects gracefully.

## Alternatives Considered

- **No terraforming (static terrain)**: Rejected — the user specifically wants
  the agent to shape the world. Static terrain limits the agent to working
  around terrain rather than changing it, which reduces long-term engagement.
- **Instant terraforming (no time/resource cost)**: Rejected — terraforming
  should be a major industrial project, not a casual action. Without cost,
  the agent would flatten everything immediately, removing terrain as a
  strategic consideration entirely.
- **Free-form terrain editing (no recipes/facilities)**: Rejected —
  terraforming should integrate with the existing facility/recipe system for
  consistency. The agent must build infrastructure to terraform, not just
  issue abstract commands.
- **Procedural terrain (no base data)**: Rejected — starting from real Earth
  terrain (SRTM) and modifying it is more meaningful than starting from
  nothing. The base data grounds the game in reality; modifications show the
  agent's impact.
- **Separate terrain editing system (not recipes)**: Rejected — using the
  recipe system (ADR-0018) for terraforming keeps the architecture consistent
  and avoids a parallel system. Terraforming is just production where the
  output is a terrain change.
