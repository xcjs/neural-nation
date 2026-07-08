# ADR-0007: Facility & Supply Chain System

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0003, ADR-0013, ADR-0014 |

## Context

The LLM builds facilities to extract, process, and transport resources. The
economy is a full supply chain: raw materials are extracted, refined into
intermediate goods, and manufactured into final products. Transport
infrastructure must be explicitly built by the LLM to move resources between
facilities.

## Decision

### Facility Types (Hierarchical Tiers)

**Tier 0 — Extractors** (gather raw resources from deposits):
- `mine` — extracts mineral/element deposits (ore, coal, etc.)
- `well` — extracts oil/gas deposits
- `farm` — produces wood (from forest regions) or food (from arable land)
- `water_pump` — extracts freshwater from water deposits
- `quarry` — extracts stone, gravel, bulk minerals

**Tier 1 — Processors** (transform raw resources):
- `smelter` — ore → metal (e.g., iron ore → iron, bauxite → aluminum)
- `refinery` — oil → fuel, plastics precursors
- `sawmill` — wood (logs) → lumber
- `kiln` — limestone → cement, clay → bricks
- `water_treatment` — raw water → potable water

**Tier 2 — Factories** (manufacture from processed materials):
- `factory` — metal + components → machinery, parts
- `chemical_plant` — elements/compounds → chemicals, alloys
- `power_plant` — fuel/coal/uranium → electricity (powers other facilities).
  **Note**: This is the basic fossil/nuclear power type. See ADR-0014 for the
  full power generation system with multiple types (solar, wind, hydro,
  geothermal, nuclear, fusion, etc.) and transmission network mechanics.
- `electronics_plant` — rare elements + metals → electronic components

**Tier 3 — Advanced / Synthesis** (endgame):
- `research_lab` — synthesizes rare/synthetic elements (requires particle
  accelerator subcomponents)
- `reactor` — breeder reactor for transuranic synthesis
- `spaceport` — enables space-based extraction. See ADR-0016 for the full
  space infrastructure chain (spaceport → space station → orbital refinery →
  asteroid mining drones → lunar mines → deep space probes).

**Tier — Infrastructure** (not production, but required):
- `storage` — stockpile point for resources (warehouses, tanks, silos)
- `power_line` — transports electricity between facilities
- `pipeline` — transports fluids (oil, water, gas)
- `conveyor` — transports solids (ore, metal, components)
- `road` — general transport for mixed goods (lowest speed/capacity)

**Terrain Infrastructure** (modifiers that enable transport through difficult
terrain — see ADR-0013):
- `tunnel` — enables roads/conveyors through mountain cells
- `bridge` — enables roads/conveyors across ocean/coastal cells
- `pumping_station` — enables pipelines through mountains
- `transmission_tower` — enables power lines through high mountains
- `subsea_pipeline` — enables pipelines across deep ocean

### Facility Placement Rules

- Facilities placed at lat/lon coordinates by the LLM via `build_facility`.
- Extractors must be placed near (within range of) a discovered resource deposit
  of the appropriate type.
- Processors/factories can be placed anywhere but benefit from proximity to
  their input sources (lower transport cost).
- Power consumers must be connected to a power source via `power_line`.
  See ADR-0014 for the full power generation and transmission system
  (multiple generator types, transmission loss, grid balancing, power
  storage).
- Each facility has a construction cost (resources consumed to build) and a
  construction time (ticks to complete).
- **Terrain effects** (ADR-0013): Facilities in mountain/high-mountain terrain
  have a construction cost multiplier (logistical difficulty). Facilities at
  extreme elevation (>3000m) have a production efficiency penalty. Ocean
  facilities (`offshore_platform`, `desalination_plant`) can be placed on
  ocean cells for specific resource types.

### Transport System (Explicit Infrastructure)

The LLM must build transport links between facilities to move resources. Each
transport link is a physical connection with:

- **Type**: `pipeline`, `conveyor`, `road`, `power_line`.
- **From / To**: source and destination facility IDs.
- **Path**: great-circle route across the globe surface (for visual rendering).
- **Capacity**: max throughput per tick (depends on transport type).
- **Speed**: ticks for a resource unit to traverse the link.
- **Cost**: construction cost in resources (proportional to distance + type +
  terrain modifiers — see below).
- **Terrain constraints**: The path is evaluated against the terrain elevation
  grid (ADR-0013). Mountain/high-mountain cells block roads and conveyors
  unless a `tunnel` is built. Ocean cells block surface transport unless a
  `bridge` is built. Pipelines need `pumping_station` for mountains and
  `subsea_pipeline` for deep ocean. Power lines need `transmission_tower` for
  high mountains. See ADR-0013 for terrain infrastructure upgrades.

**Terrain-aware pathfinding**: `build_transport` checks the terrain along the
planned great-circle path. If impassable terrain is encountered, the tool
returns an error identifying the obstacle and the required modifier. The LLM
must then build the modifier (e.g., `build_transport` with type `tunnel` on the
blocked segment) and retry the base link. Alternatively, the LLM can use
`get_terrain_path` (ADR-0013) to pre-scout a route before committing.

**Flow assignment**: The LLM assigns which resources flow on which transport
link via the `assign_route` tool. A transport link can carry multiple resource
types up to its capacity.

**Visual**: Transport links render as glowing arcs along the globe surface,
color-coded by resource type flowing. Active flow shows animated pulses moving
along the arc (ADR-0002, ADR-0008).

### Supply Chain Example

```
  iron deposit → [mine] →conveyor→ [smelter] →conveyor→ [factory] →road→ [storage]
                                ↑                                    ↑
                            [power_plant] ←power_line← [coal mine]    |
                                                                      |
  coal deposit → [mine] →conveyor→ [power_plant]                     |
                                                                      |
  water deposit → [water_pump] →pipeline→ [factory] (cooling) ───────┘
```

The LLM must identify the chain, build each facility, connect them with the
right transport types, and assign flows. Gaps in the chain (missing power,
missing transport) result in idle facilities.

### Production Model

Each facility has:

- **Inputs**: required resources per tick (e.g., smelter needs iron ore + coal +
  electricity).
- **Outputs**: produced resources per tick (e.g., smelter produces iron + slag).
- **Production rate**: determined by facility type, available inputs, and power.
  If any input is missing, production drops to zero (or proportionally reduces).
- **Efficiency**: affected by deposit grade (for extractors), facility age,
  power stability. Can be upgraded by the LLM via `set_production_target` or
  future upgrade tools.

### Buffer Model (Per-Facility Buffers)

There is **no global stockpile** by default. Resources live in per-facility
buffers:

- **Input buffer**: Each facility has a limited-capacity input buffer for each
  resource it consumes. Transport links fill it; production drains it.
- **Output buffer**: Each facility has a limited-capacity output buffer for each
  resource it produces. Production fills it; transport links drain it.
- **Storage facilities**: `storage` facilities act as dedicated large-capacity
  buffers. They have input/output buffers with much higher caps than production
  facilities. They serve as collection points for excess production.
- **Overflow**: If a facility's output buffer is full and no transport/storage
  is connected, production halts (overflow). The LLM must build transport or
  storage to keep production flowing.

### Uncollected Natural Resources (Global Buffer)

Extracted resources that have not been picked up by transport are NOT
unlimited. The "uncollected" state is a **global buffer** with realistic caps:

- **Surface resources** (wood, water from rivers, surface minerals): uncollected
  extraction accumulates at the extraction site up to a cap based on the
  site's physical capacity (e.g., a mine's stockpile area). Beyond the cap,
  extraction stops until transport relieves the buffer.
- **Subsurface resources** (mined ore, pumped oil): cannot be left uncollected
  indefinitely — the extraction facility has a finite output buffer. Once full,
  extraction halts. This models real-world stockpile limits at mine heads and
  well heads.
- **Natural regeneration** (wood, water): surface resources like wood and water
  regenerate slowly if not over-extracted, but only up to the deposit's natural
  capacity. Over-extraction depletes the deposit permanently (no regeneration
  beyond the original quantity).

This means the LLM cannot just "extract everything and leave it" — it must
build transport to move extracted resources to processing/storage, or
extraction will halt. The global buffer for uncollected resources is capped
at realistic values per deposit/extractor, not a single global number.

## Consequences

**Positive:**
- Full supply chain gives the LLM rich decision-making: where to build, what
  to connect, how to balance inputs/outputs.
- Explicit transport infrastructure creates a visually compelling globe —
  glowing arcs and lines connecting facilities is the core visual payoff.
- Tiered facility system provides progression: extractors → processors →
  factories → advanced synthesis.

**Negative:**
- Complexity of the supply chain is high; the LLM must understand input/output
  dependencies. The MCP tools must return enough state info for the LLM to
  reason about gaps.
- Transport pathfinding on a sphere (great-circle routing) needs implementation;
  facilities at high latitudes may have routing edge cases.
- **Terrain-aware routing** (ADR-0013) adds pathfinding complexity — the system
  must check terrain class along the path and require terrain modifiers
  (tunnels, bridges) for impassable cells. A grid-based pathfinder (A* on the
  elevation grid) or terrain-along-path checker is needed.
- The simulation tick must handle dependency resolution (a factory needs its
  inputs transported from smelter which needs inputs from mine) — ordering
  matters within a tick.

## Alternatives Considered

- **Abstract logistics (no physical transport)**: Rejected — explicit transport
  infrastructure is a core visual and gameplay goal. The player wants to see
  glowing lines connecting their civilization.
- **Simple extractors only**: Rejected — full supply chain was chosen
  specifically to give the LLM meaningful management complexity.
- **Automatic transport (connect facilities and goods flow by magic)**:
  Rejected — removing transport as an LLM decision reduces the strategic depth
  and the visual payoff.