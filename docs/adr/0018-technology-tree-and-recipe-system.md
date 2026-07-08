# ADR-0018: Technology Tree & Recipe System

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0003, ADR-0004, ADR-0006, ADR-0007, ADR-0011, ADR-0012, ADR-0016, ADR-0021, ADR-0023 |

## Context

ADR-0007 defines facility tiers and a supply chain, but the inputs/outputs of
each facility are left implicit. The LLM needs a concrete system that defines
*what* each facility can produce, *what* it needs to do so, and *how* the
agent unlocks more advanced production over time. Without recipes and a tech
tree, "build a factory" has no mechanical meaning — the agent can't know what
components are required, what intermediate goods to stockpile, or what it needs
to research before building advanced facilities.

The user wants:
- Recipes: X amount of resource Y needed to produce Z. Some recipes need
  multiple input components.
- A technology/"crafting" tree that gates progression — advanced recipes and
  facility types are locked until prerequisites are researched.

## Decision

### Recipe System

A **recipe** defines a deterministic transformation: N inputs → M outputs,
executed by a specific facility type. Recipes are data-driven (stored in the
template DB, not hardcoded in source). All quantities use metric units per
ADR-0021 (tonnes for mass, m³ for volume, MW·tick for energy).

**Recipe structure:**

```typescript
interface Recipe {
  Id: string                    // e.g. 'IronSmelting', 'ElectronicsAssembly'
  Name: string                  // 'Iron Smelting', 'Electronics Assembly'
  FacilityType: FacilityType    // which facility executes this recipe
  Inputs: RecipeInput[]         // required inputs (resource + quantity)
  Outputs: RecipeOutput[]        // produced outputs (resource + quantity)
  CraftTime: number             // ticks per production cycle
  TechRequired?: string         // tech node ID that unlocks this recipe (if any)
  MinFacilityCount?: number     // for multi-facility recipes (see below)
}

interface RecipeInput {
  ResourceKey: string           // 'Fe_ore', 'Coal', 'Water'
  Quantity: number              // units consumed per cycle (t or m³, per ADR-0021)
  Unit: Unit                    // 't' | 'm³' | 'MW' | 'count' (ADR-0021)
  Optional?: boolean            // if true, production scales with availability
}

interface RecipeOutput {
  ResourceKey: string           // 'Iron', 'Slag', 'Electronics'
  Quantity: number              // units produced per cycle (t or m³, per ADR-0021)
  Unit: Unit                    // 't' | 'm³' | 'count' (ADR-0021)
}
```

### Multi-Component Recipes

Recipes frequently require multiple distinct inputs. This is the core
"crafting" mechanic — assembling complex goods from diverse components.

Examples:

| Recipe | Facility | Inputs | Outputs |
|--------|----------|--------|---------|
| Iron Smelting | Smelter | 2 Iron Ore + 1 Coal + power | 2 Iron + 1 Slag |
| Steel Making | Smelter | 2 Iron + 1 Coal + 0.5 Limestone + power | 2 Steel + 0.5 Slag |
| Concrete | Kiln | 2 Limestone + 1 Water | 3 Concrete |
| Electronics Assembly | Electronics Plant | 1 Silicon + 0.5 Copper + 0.1 Gold + 0.2 Plastics + power | 1 Electronics |
| Machinery | Factory | 3 Steel + 1 Electronics + 0.5 Lubricant + power | 1 Machinery |
| Fuel Refining | Refinery | 3 Crude Oil + 0.5 Water + power | 2 Fuel + 1 Plastics Precursor |
| Nuclear Fuel Rod | Factory | 2 Uranium + 1 Steel + 0.1 Electronics + power | 1 Nuclear Fuel Rod |
| Fusion Reactor Core | Factory | 10 Steel + 5 Electronics + 2 Helium-3 + 5 Machinery + power | 1 Fusion Core |

Optional inputs (e.g., lubricant for machinery) boost production rate but
aren't strictly required — production scales down proportionally if absent.

### Manufactured Resources (New Category)

ADR-0003 defines three resource categories (Renewable, Non-Renewable, Elements).
A **fourth category** is added: **Manufactured** — resources that do not exist
in nature and are only produced by recipes.

Manufactured resources include:

| Resource | First Produced By | Used By |
|----------|-------------------|---------|
| Iron | Smelter (from ore) | Steel, machinery, construction |
| Steel | Smelter (from iron) | Advanced construction, machinery |
| Aluminum | Smelter (from bauxite) | Aerospace, electronics |
| Copper | Smelter (from copper ore) | Electronics, power lines |
| Lumber | Sawmill (from wood) | Construction, paper |
| Cement/Concrete | Kiln (from limestone) | Construction, roads |
| Bricks | Kiln (from clay) | Construction |
| Fuel | Refinery (from crude oil) | Power plants, rockets, vehicles |
| Plastics | Refinery (from oil) | Electronics, components |
| Silicon | Smelter (from quartz/silica) | Electronics |
| Electronics | Electronics Plant | Machinery, advanced facilities |
| Machinery | Factory | Advanced facilities, space infrastructure |
| Lubricant | Chemical Plant (from oil) | Machinery production, maintenance |
| Chemicals | Chemical Plant (from elements) | Advanced recipes |
| Alloys | Chemical Plant (from metals) | Advanced construction |
| Nuclear Fuel Rod | Factory (from uranium) | Nuclear reactors |
| Fusion Core | Factory (from helium-3 + materials) | Fusion reactors |
| Rocket Parts | Factory (from steel + electronics + fuel) | Spaceport launches |
| Satellite Kit | Factory (from electronics + machinery + solar panels) | Deep space probes |

Manufactured resources flow through the same transport/buffer system as
extracted resources (ADR-0007). They are stored in facility output buffers and
moved via transport links.

### Technology Tree

A **tech node** represents a researchable advancement that unlocks recipes,
facility types, or infrastructure. The tech tree gates progression so the agent
can't build fusion reactors on tick 1.

**Tech node structure:**

```typescript
interface TechNode {
  Id: string                    // 'BasicMetallurgy', 'NuclearEngineering'
  Name: string
  Description: string
  Tier: number                  // 0-4 for display grouping
  Prerequisites: string[]       // tech node IDs that must be completed first
  ResearchCost: ResearchCost[]  // resources consumed to research
  ResearchTime: number          // ticks of continuous research_lab operation
  Unlocks: TechUnlock[]         // what this tech enables
  Category: TechCategory        // branch (Metallurgy, Chemistry, Power, etc.)
}

interface ResearchCost {
  ResourceKey: string
  Quantity: number
}

interface TechUnlock {
  Type: 'Recipe' | 'FacilityType' | 'TransportType' | 'TerrainModifier' | 'SpaceFacility' | 'TerraformAction'
  Id: string                    // recipe ID, facility type, terraform action, etc.
}
```

### Tech Tree Structure (Branches)

```
                    [Starting Techs — available without research]
                    ├── Basic Extraction (mine, well, quarry, farm, water_pump)
                    ├── Basic Processing (smelter, sawmill, kiln, refinery, water_treatment)
                    ├── Basic Power (diesel_generator, coal_plant)
                    ├── Basic Transport (road, conveyor, pipeline, power_line)
                    └── Basic Construction (storage)
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
  [Metallurgy Branch]       [Chemistry Branch]         [Power Branch]
  Advanced Metallurgy        Industrial Chemistry       Advanced Fossil
  → Steel making             → Plastics                 → Gas Plant
  → Alloy production         → Lubricants               → Oil Plant
  → Aluminum processing      → Synthetic Fibers           │
        │                    → Fertilizer                  ▼
        ▼                          │                    Nuclear Power
  Precision Manufacturing         ▼                      → Nuclear Reactor
  → Electronics Plant       Advanced Materials            → Breeder Reactor
  → Electronics              → Composites                 → Nuclear Fuel Rods
  → Silicon extraction       → Carbon Materials             │
        │                          │                        ▼
        ▼                          ▼                    Fusion Power
  Machinery & Automation     Biotechnology              → Fusion Reactor
  → Machinery                → Biomass Processing          → Helium-3 Handling
  → Advanced Factories       → Biofuel/Ethanol            → Fusion Core
  → Automated Production     → Soylent Research             │
        │                          │                        │
        └──────────┬───────────────┴────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
[Terraforming]  [Space Branch]   
Earthworks      Aerospace Engineering
→ Excavator     → Spaceport
→ Flatten        → Rocket Assembly
→ Dig Canal      → Rocket Parts recipe
→ Embankment          │
     │                ▼
     ▼           Orbital Infrastructure
Hydraulic Eng.  → Space Station
→ Dredger        → Orbital Refinery
→ Reservoir      → Assign Space Crew
→ Drain               │
→ Divert              ▼
     │           Deep Space Technology
     ▼           → Asteroid Mining Drones
Advanced Terra.  → Lunar Mining
→ Terraformer     → Deep Space Probes
→ Level Mountain  → Space Habitat
→ Raise Land
→ Excavate Shaft
→ Create Mountain
     │
     ▼
Planetary Engineering
→ Planetary Engine
→ Continental Shift
→ Ocean↔Land Conversion
(requires Fusion Power)
```

### Research Mechanics

- The agent builds a `research_lab` facility (Tier 3 — requires
  Precision Manufacturing tech to unlock).
- Research is initiated via a new MCP tool `start_research(techNodeId)`.
- The research_lab consumes input resources per tick (the research cost spread
  over the research time). If inputs run out, research pauses (not lost).
- Research progresses only when the lab has power + required inputs.
- Multiple research_labs can work on different techs in parallel (each lab
  researches one tech at a time).
- Event-driven ticks (ADR-0006): research advances one step per MCP call, same
  as production. Idle games = paused research.
- When research completes, the tech node is marked `Completed`, and its
  unlocks become available (recipes usable, facility types buildable).

### Construction Costs as Recipes

Building a facility is itself a recipe — the `construction_cost` in ADR-0007
is formalized as a recipe with:
- Inputs: the construction resource requirements (Steel, Concrete, Machinery,
  etc. — varies by facility type and terrain modifier)
- Outputs: the facility itself (placed on the globe)
- CraftTime: construction ticks (facility appears as "under construction"
  with the chaotic particle swirl per ADR-0008)

This means advanced facilities need advanced manufactured goods:
- A `factory` requires Steel + Concrete + Machinery + Electronics
- A `nuclear_reactor` requires Steel + Concrete + Electronics + Uranium +
  Machinery + (Nuclear Power tech)
- A `fusion_reactor` requires Steel + Electronics + Helium-3 + Machinery +
  Fusion Core + (Fusion Power tech)
- A `spaceport` requires Steel + Concrete + Electronics + Machinery + Fuel +
  (Aerospace Engineering tech)

Facility construction costs scale with terrain (mountains multiply cost per
ADR-0013).

### Recipe Data Storage

Recipes and tech nodes are **static game data** — they don't change per game.
They are stored in the template DB (ADR-0011) as seed data and copied into
each game's DB at creation. The agent's research progress (which techs are
completed, which are in progress) is per-game state.

```
recipes
  id              TEXT PRIMARY KEY  -- 'IronSmelting'
  name            TEXT              -- 'Iron Smelting'
  facility_type   TEXT              -- 'Smelter'
  craft_time      INTEGER           -- ticks per cycle
  tech_required   TEXT NULL         -- tech node ID, or NULL if always available

recipe_inputs
  recipe_id       TEXT
  resource_key    TEXT
  quantity        REAL
  is_optional     INTEGER DEFAULT 0

recipe_outputs
  recipe_id       TEXT
  resource_key    TEXT
  quantity        REAL

tech_nodes
  id              TEXT PRIMARY KEY  -- 'BasicMetallurgy'
  name            TEXT
  description     TEXT
  tier            INTEGER
  category        TEXT              -- 'Metallurgy', 'Chemistry', 'Power', 'Space'
  research_time   INTEGER           -- ticks
  prerequisites   TEXT              -- JSON array of tech node IDs

tech_costs
  tech_id         TEXT
  resource_key    TEXT
  quantity        REAL

tech_unlocks
  tech_id         TEXT
  unlock_type     TEXT              -- 'Recipe', 'FacilityType', 'TransportType', ...
  unlock_id       TEXT              -- recipe/facility/transport ID

game_research
  game_id         TEXT              -- token
  tech_id         TEXT
  status          TEXT              -- 'Available', 'InProgress', 'Completed'
  progress        REAL              -- 0.0 to 1.0
  lab_facility_id INTEGER NULL      -- which research_lab is working on it
```

### Facility-Recipe Binding

Each facility type has a set of recipes it can execute. The LLM sets a
facility's active recipe via `set_production_target` (extended — now accepts
a recipe ID, not just a rate). A facility can switch recipes if it has the
required inputs and the recipe's tech is completed.

Example facility-recipe mappings:

| Facility Type | Available Recipes |
|---------------|-------------------|
| Smelter | Iron Smelting, Steel Making, Aluminum Smelting, Copper Smelting, Silicon Extraction |
| Refinery | Fuel Refining, Plastics Production, Lubricant Production |
| Kiln | Concrete Production, Brick Production, Cement Production |
| Chemical Plant | Chemical Synthesis, Alloy Production, Fertilizer Production, Composite Materials |
| Electronics Plant | Electronics Assembly, Solar Panel Production, Circuit Production |
| Factory | Machinery, Nuclear Fuel Rods, Rocket Parts, Satellite Kits, Fusion Cores |
| Research Lab | (research, not production — consumes research costs, produces tech progress) |
| Excavator | Flatten Terrain, Dig Canal, Road Embankment (ADR-0023) |
| Dredger | Create Reservoir, Drain Area, Divert River (ADR-0023) |
| Terraformer | Level Mountain, Raise Land, Excavate Shaft, Create Mountain (ADR-0023) |
| Planetary Engine | Continental Shift, Ocean→Land, Land→Ocean (ADR-0023) |

The LLM chooses which recipe a facility runs based on what outputs it needs
and what inputs are available. This replaces the generic "inputs/outputs" model
in ADR-0007 with concrete, enumerable recipes.

## Consequences

**Positive:**
- Recipes give the LLM concrete, queryable production paths — it can plan
  "I need Electronics, which needs Silicon + Copper + Gold + Plastics, so I
  need a Smelter for Silicon, a Refinery for Plastics, mines for Copper and
  Gold..."
- Tech tree creates progression pressure — the agent can't skip to endgame
  without investing in research, which costs resources and time.
- Multi-component recipes create meaningful supply chain depth — the agent
  must coordinate multiple facility types producing intermediate goods.
- Construction-as-recipe ties facility building into the same system — the
  agent must produce construction materials before building advanced facilities.
- Data-driven recipes/techs make the system extensible — new recipes and tech
  nodes can be added to the template DB without code changes.

**Negative:**
- Significantly more per-tick complexity — the tick processor must resolve
  recipes, check inputs, scale production, and handle recipe switching.
- The template DB grows (recipes, recipe_inputs, recipe_outputs, tech_nodes,
  tech_costs, tech_unlocks tables + seed data).
- The LLM has more to reason about — it must understand the tech tree and
  recipe graph. MCP tools must expose this clearly (see ADR-0004 update).
- Balancing recipe input/output quantities and tech costs is a design effort
  that requires playtesting with the LLM.

## Alternatives Considered

- **Hardcoded recipes in source code**: Simpler to implement but loses
  extensibility and data-driven design. Rejected — storing recipes in the
  DB allows rebalancing without code changes and keeps recipe data with the
  game data.
- **Free-form production (no recipes)**: Facilities produce generic "output"
  without specific recipes. Rejected — too abstract; the user wants concrete
  "X resource Y to craft Z" mechanics.
- **Flat tech tree (no prerequisites)**: All recipes available from start.
  Rejected — the user wants a technology tree that gates progression and
  creates research goals.
- **Tech tree as code (not DB)**: Tech nodes hardcoded in TypeScript. Rejected
  for the same reason as hardcoded recipes — data-driven is more flexible
  and keeps the tech tree definition with the game data.