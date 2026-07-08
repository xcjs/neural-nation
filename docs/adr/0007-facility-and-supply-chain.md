# ADR-0007: Facility & Supply Chain System

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |

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
- `power_plant` — fuel/coal/uranium → electricity (powers other facilities)
- `electronics_plant` — rare elements + metals → electronic components

**Tier 3 — Advanced / Synthesis** (endgame):
- `research_lab` — synthesizes rare/synthetic elements (requires particle
  accelerator subcomponents)
- `reactor` — breeder reactor for transuranic synthesis
- `spaceport` — enables space-based extraction (future expansion hook)

**Tier — Infrastructure** (not production, but required):
- `storage` — stockpile point for resources (warehouses, tanks, silos)
- `power_line` — transports electricity between facilities
- `pipeline` — transports fluids (oil, water, gas)
- `conveyor` — transports solids (ore, metal, components)
- `road` — general transport for mixed goods (lowest speed/capacity)

### Facility Placement Rules

- Facilities placed at lat/lon coordinates by the LLM via `build_facility`.
- Extractors must be placed near (within range of) a discovered resource deposit
  of the appropriate type.
- Processors/factories can be placed anywhere but benefit from proximity to
  their input sources (lower transport cost).
- Power consumers must be connected to a power source via `power_line`.
- Each facility has a construction cost (resources consumed to build) and a
  construction time (ticks to complete).

### Transport System (Explicit Infrastructure)

The LLM must build transport links between facilities to move resources. Each
transport link is a physical connection with:

- **Type**: `pipeline`, `conveyor`, `road`, `power_line`.
- **From / To**: source and destination facility IDs.
- **Path**: great-circle route across the globe surface (for visual rendering).
- **Capacity**: max throughput per tick (depends on transport type).
- **Speed**: ticks for a resource unit to traverse the link.
- **Cost**: construction cost in resources (proportional to distance + type).

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

### Stockpile Model

Resources accumulate in stockpiles. Each facility has an internal buffer
(input/output). Excess flows to connected `storage` facilities. If a
facility's output buffer is full and no transport/storage is connected,
production halts (overflow).

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