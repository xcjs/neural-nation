# ADR-0019: MCP Response Management & Search

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Status     | Proposed                               |
| Date       | 2026-07-08                             |
| Deciders   | Project owner                          |
| Relates to | ADR-0004, ADR-0007, ADR-0012, ADR-0018 |

## Context

The game exposes a large state space to the LLM agent: 118 elements + bulk
resources + manufactured goods (ADR-0003/0018), hundreds of facilities, dozens
of transport links, a tech tree with 20+ nodes, and a recipe graph with
50+ recipes. If MCP tools return everything at once, the response payloads
will overwhelm the LLM's context window, degrading its ability to reason
about the game state. The agent also needs a way to find what it's looking for
without retrieving the entire game state — searching by construction item
("what do I need to build a nuclear reactor?"), by recipe output ("what
produces Electronics?"), or by free-text query.

## Decision

### Response Pagination

All MCP tools that return lists **must support pagination** via `limit` and
`offset` parameters. Default limits are tuned to keep responses concise:

| Tool                       | Default Limit | Max Limit |
| -------------------------- | ------------- | --------- |
| `get_discovered_resources` | 50            | 200       |
| `list_facilities`          | 50            | 200       |
| `list_transports`          | 50            | 200       |
| `get_event_log`            | 25            | 100       |
| `get_resource_overview`    | 50            | 200       |
| `get_recipes`              | 50            | 200       |
| `get_tech_tree`            | 50            | 100       |

Each paginated response includes:

```typescript
interface PaginatedResult<T> {
  Items: T[]
  TotalCount: number
  Limit: number
  Offset: number
  HasMore: boolean
}
```

The agent can page through results with subsequent calls. This keeps any
single MCP response bounded.

### Response Summarization

Tools that return complex state provide **summary-first** responses with
detail on demand:

- `get_game_state` returns a high-level summary (tick count, facility count,
  power status, resource category totals, top 5 stockpiles, active alerts).
  The agent drills into specifics via `get_resource_overview`,
  `get_resource_details`, `list_facilities`, etc.
- `get_resource_overview` returns per-resource summary rows (resource key,
  category, total remaining, collected, production rate, depletion %). It
  does NOT return every deposit — that's `get_resource_details`.
- `get_supply_chain_status` returns a summary graph (facility count by type,
  bottleneck flags, missing inputs). Full facility details require
  `list_facilities` + `get_facility_details`.
- `get_power_grid_status` returns summary (total generation, total demand,
  grid components, brownout/blackout flags). Per-plant details require
  `list_facilities` filtered by power types.

### Search Tools

Add new MCP tools specifically for searching the game's static data
(recipes, tech tree, facility types, resource relationships) and live state:

**`search_resources`** — Search resources by name, element symbol, category,
or construction dependency.

```typescript
// Arguments
{
  Query?: string        // free-text search on resource name/symbol
  Category?: ResourceCategory  // filter by category
  UsedByRecipe?: string  // find resources used as input by a recipe
  ProducedByRecipe?: string  // find resources output by a recipe
  NeededForFacility?: string  // find resources needed to build a facility type
  NeededForTech?: string  // find resources needed to research a tech node
  Limit?: number
  Offset?: number
}
```

Examples:

- `search_resources({ Query: "iron" })` → returns Iron (element),
  Iron Ore (deposit), Iron Smelting (recipe reference).
- `search_resources({ NeededForFacility: "nuclear_reactor" })` →
  returns Steel, Concrete, Electronics, Uranium, Machinery (construction
  recipe inputs) + Nuclear Fuel Rod (fuel input) + Water (cooling).
- `search_resources({ ProducedByRecipe: "ElectronicsAssembly" })` →
  returns Electronics.

**`search_recipes`** — Search recipes by output resource, facility type,
tech requirement, or input resource.

```typescript
{
  Query?: string              // free-text on recipe name
  OutputResource?: string     // recipes that produce this resource
  InputResource?: string      // recipes that consume this resource
  FacilityType?: FacilityType // recipes for a specific facility type
  TechRequired?: string       // recipes unlocked by a tech node
  UnlockedOnly?: boolean      // only recipes whose tech is completed
  Limit?: number
  Offset?: number
}
```

Examples:

- `search_recipes({ OutputResource: "Electronics" })` → returns
  Electronics Assembly recipe with full inputs/outputs.
- `search_recipes({ InputResource: "Iron", FacilityType: "Smelter" })` →
  returns Steel Making (consumes Iron, runs in Smelter).
- `search_recipes({ FacilityType: "Factory", UnlockedOnly: true })` →
  all Factory recipes the agent can currently execute.

**`search_facilities`** — Search built facilities by type, status, resource
produced, or location.

```typescript
{
  Type?: FacilityType
  Status?: FacilityStatus
  ProducesResource?: string   // facilities with a recipe outputting this
  ConsumesResource?: string   // facilities with a recipe inputting this
  NearLat?: number             // filter by proximity (with NearLon + NearRadiusKm)
  NearLon?: number
  NearRadiusKm?: number
  Limit?: number
  Offset?: number
}
```

### Search Implementation

- Search is implemented in the `mcp` domain (ADR-0017) as a set of query
  services that join across the game DB tables (facilities, recipes,
  recipe_inputs, recipe_outputs, tech_nodes, resources, stockpiles).
- Static data (recipe definitions, tech tree, facility types) can be
  cached in memory per MCP server instance after first query — it doesn't
  change per game.
- Free-text search uses SQLite `LIKE` with case-insensitive matching (no
  FTS5 dependency for v1). Sufficient for ~200 resources and ~50 recipes.
- Search results are paginated like all other list tools.

### Response Size Budget

As a guideline, MCP tool responses should stay under **~4,000 tokens** of
JSON. The default limits above are tuned for this. If a response exceeds the
budget, the tool truncates and includes a `Truncated: true` flag + a hint
to use pagination or filtering.

## Consequences

**Positive:**

- LLM context window is protected — no single tool call dumps the entire
  game state.
- Search tools let the LLM ask targeted questions ("what do I need for X?")
  instead of retrieving everything and filtering in-context.
- Pagination is consistent across all list-returning tools.
- Summary-first responses give the agent a quick overview, with drill-down
  for details only when needed.

**Negative:**

- More MCP tool calls per "turn" — the agent may need 2-3 calls to gather
  full context for a decision. This is acceptable: event-driven ticks (ADR- 0006) mean each call also advances the game.
- Search implementation adds query complexity to the MCP domain layer.
- Free-text search via `LIKE` is not as powerful as FTS5; acceptable for v1
  data volume.

## Alternatives Considered

- **Return everything, let the LLM filter**: Rejected — context window
  pressure would degrade the LLM's reasoning quality, especially for long
  games with hundreds of facilities.
- **FTS5 full-text search**: Overkill for ~200 resources and ~50 recipes.
  Can be added later if the recipe/resource graph grows significantly.
- **Pre-computed search indexes**: Unnecessary at this scale; SQLite JOIN +
  LIKE is fast enough.
- **No search tools (browse-only)**: Rejected — the user specifically wants
  the agent to search by construction item and by name. Without search, the
  agent must retrieve and parse the full recipe/facility list every time.
