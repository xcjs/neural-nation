# ADR-0017: Code Organization & Domain-Driven Design

| Field      | Value                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Status     | Superseded by ADR-0027                                                                          |
| Date       | 2026-07-08                                                                               |
| Deciders   | Project owner                                                                            |
| Relates to | ADR-0001, ADR-0006, ADR-0007, ADR-0004, ADR-0013, ADR-0014, ADR-0015, ADR-0016, ADR-0022 |

## Context

ADR-0001 selects Nuxt 3 as the application framework. Nuxt imposes mandatory
directory conventions (pages, layouts, middleware, plugins, server/api,
composables, components auto-import). However, Nuxt does not prescribe how to
organize business logic, server-side domain code, or shared types. Without a
deliberate structure, feature code tends to scatter across `server/api/`,
`server/utils/`, `composables/`, and `components/` by technical layer rather
than by domain, making it hard to understand a single feature end-to-end.

The project has well-defined domains (game lifecycle, MCP, resources, facilities,
transport, terrain, power, humanity, space). Each domain has schema, services,
types, tools, and UI components that belong together.

## Decision

Use a **hybrid Nuxt-conventions + domain-driven design** structure. Keep
Nuxt's mandatory conventions where required, but group all domain logic by
feature set. Each domain is a self-contained module with its own types,
services, repositories, and schema.

### Principles

1. **Nuxt conventions are kept only where mandatory** — routing (`pages/`),
   layouts, plugins, middleware, `server/api/` route handlers, and the
   auto-import directories (`composables/`, `server/utils/`).
2. **Domain modules group everything for a feature** — types, services,
   repositories, validation, and schema live together under `server/domain/`.
3. **API routes are thin** — `server/api/` handlers are controllers only; they
   parse input, call a domain service, and return a response. No business logic
   in route handlers.
4. **Shared types live outside the server** — types used by both client and
   server go in `lib/` so both can import them without crossing the server
   boundary.
5. **Client components group by domain** — `components/` subdirectories mirror
   server domains where applicable.
6. **Pragmatic DDD** — not full aggregate-root/value-object ceremony. Each
   domain module has: `types.ts`, service files, repository files, and optional
   schema. The module exports a public API; internal files are not imported
   from outside the domain.

### Directory Structure

```
neural-nation/
├── nuxt.config.ts
├── app.vue
├── tailwind.config.ts
│
├── pages/                          # Nuxt convention (mandatory)
│   ├── index.vue                   # Landing / new game
│   └── play/[token].vue            # Game view
│
├── layouts/                        # Nuxt convention
│   └── default.vue
│
├── middleware/                     # Nuxt convention
│   └── auth.ts                     # Token validation for play route
│
├── plugins/                        # Nuxt convention
│   └── drizzle.client.ts           # (if needed client-side)
│
├── components/                     # Grouped by domain
│   ├── earth/
│   │   ├── EarthGlobe.vue
│   │   ├── TerrainMesh.vue
│   │   ├── FacilityMarkers.vue
│   │   ├── ParticleClouds.vue
│   │   └── TransportArcs.vue
│   ├── hud/
│   │   ├── ResourceTracker.vue
│   │   ├── EventFeed.vue
│   │   ├── ActionConsole.vue
│   │   ├── EnvironmentalStatus.vue
│   │   ├── GameOverviewBar.vue
│   │   ├── FacilityDetailPanel.vue
│   │   └── McpConnectionPanel.vue
│   └── game/
│       ├── NewGameForm.vue
│       ├── TokenDisplay.vue
│       └── GameOverOverlay.vue
│
├── composables/                    # Nuxt convention (auto-imported)
│   ├── useGame.ts
│   ├── useResources.ts
│   ├── useFacilities.ts
│   ├── useTransport.ts
│   ├── usePower.ts
│   ├── useTerrain.ts
│   ├── useHumanity.ts
│   ├── useSpace.ts
│   └── useMcpConnection.ts
│
├── stores/                         # Pinia
│   ├── game.ts
│   └── ui.ts
│
├── lib/                            # Shared kernel (client + server)
│   ├── types/
│   │   ├── game.ts                  # GameMeta, TickState, DifficultyPreset
│   │   ├── resource.ts              # ResourceCategory, ResourceId
│   │   ├── facility.ts               # FacilityType, FacilityStatus
│   │   ├── transport.ts              # TransportType, RouteAssignment
│   │   ├── terrain.ts                # TerrainClass, ElevationData
│   │   ├── power.ts                  # PowerType, GridStatus
│   │   ├── humanity.ts               # PopulationState, EnvironmentState
│   │   ├── space.ts                  # SpaceFacility, Mission
│   │   └── mcp.ts                    # McpToolDef, McpToolResult
│   └── constants/
│       ├── elements.ts              # Periodic table data (118)
│       ├── facility-types.ts
│       ├── transport-types.ts
│       └── difficulty.ts             # Starting resource presets
│
├── server/
│   ├── api/                        # Nuxt convention — thin controllers
│   │   ├── mcp/
│   │   │   ├── sse.[token].get.ts   # SSE stream
│   │   │   └── messages.[token].post.ts
│   │   ├── games/
│   │   │   ├── index.post.ts        # Create game
│   │   │   ├── [token].get.ts       # Game state
│   │   │   └── [token].delete.ts    # Delete game
│   │   ├── state/
│   │   │   ├── [token]/resources.get.ts
│   │   │   ├── [token]/facilities.get.ts
│   │   │   ├── [token]/actions.get.ts
│   │   │   └── [token]/environment.get.ts
│   │   └── events/
│   │       └── [token].get.ts       # SSE event stream for web UI
│   │
│   ├── domain/                     # DDD domain layer (feature-grouped)
│   │   ├── game/
│   │   │   ├── game.service.ts      # Create, load, delete, state snapshot
│   │   │   ├── tick.service.ts       # Event-driven tick processing (ADR-0006)
│   │   │   ├── lose-condition.service.ts  # Resource depletion check (ADR-0009)
│   │   │   ├── starting-resources.service.ts  # Randomized seed (ADR-0009)
│   │   │   ├── game.repository.ts
│   │   │   └── game.validation.ts
│   │   ├── mcp/
│   │   │   ├── mcp.server.ts        # MCP HTTP/SSE transport setup
│   │   │   ├── tool-registry.ts     # Tool definitions + dispatch
│   │   │   ├── tools/
│   │   │   │   ├── survey.ts         # survey_region
│   │   │   │   ├── build.ts          # build_facility, build_transport
│   │   │   │   ├── demolish.ts       # demolish_facility, demolish_transport
│   │   │   │   ├── production.ts      # set_production_target
│   │   │   │   ├── routing.ts        # assign_route
│   │   │   │   ├── space.ts          # launch_mission, assign_space_crew
│   │   │   │   └── query.ts          # get_game_state, get_resource_overview, etc.
│   │   │   ├── token.service.ts      # Token generation + validation (ADR-0009)
│   │   │   └── action-logger.ts      # Records to actions table (ADR-0012)
│   │   ├── resources/
│   │   │   ├── resource.service.ts   # Stockpile, overview, details (ADR-0012)
│   │   │   ├── deposit.service.ts    # Survey discovery, extraction (ADR-0003)
│   │   │   ├── regeneration.service.ts  # Renewable growth (ADR-0003)
│   │   │   ├── resource.repository.ts
│   │   │   └── resource.validation.ts
│   │   ├── facilities/
│   │   │   ├── facility.service.ts   # Build, demolish, list, details
│   │   │   ├── production.service.ts # Per-tick production, targets (ADR-0007)
│   │   │   ├── buffer.service.ts    # Per-facility input/output buffers
│   │   │   ├── placement.service.ts  # Terrain validation (ADR-0013)
│   │   │   ├── facility.repository.ts
│   │   │   └── facility.validation.ts
│   │   ├── transport/
│   │   │   ├── transport.service.ts  # Build, demolish, list transports
│   │   │   ├── routing.service.ts    # Terrain-aware pathfinding (ADR-0013)
│   │   │   ├── flow.service.ts       # Per-tick resource movement
│   │   │   ├── transport.repository.ts
│   │   │   └── transport.validation.ts
│   │   ├── terrain/
│   │   │   ├── terrain.service.ts    # Elevation lookup, terrain class (ADR-0013)
│   │   │   ├── terrain.repository.ts
│   │   │   └── terrain.constants.ts  # Class thresholds, cost multipliers
│   │   ├── power/
│   │   │   ├── power.service.ts      # Generation, consumption (ADR-0014)
│   │   │   ├── grid.service.ts       # Topology, transmission loss, brownout
│   │   │   ├── storage.service.ts    # Battery banks
│   │   │   └── power.repository.ts
│   │   ├── humanity/
│   │   │   ├── population.service.ts # Logistic growth, welfare (ADR-0015)
│   │   │   ├── environment.service.ts # Pollution, forest, water, biodiversity
│   │   │   ├── incident.service.ts   # Environmental incidents
│   │   │   ├── humanity.repository.ts
│   │   │   └── humanity.validation.ts
│   │   └── space/
│   │       ├── space.service.ts      # Build space facilities (ADR-0016)
│   │       ├── launch.service.ts     # Mission launch, crew assignment
│   │       ├── space.repository.ts
│   │       └── space.validation.ts
│   │
│   ├── db/                         # Infrastructure — Drizzle ORM
│   │   ├── schema/                  # Drizzle table definitions (ADR-0010)
│   │   │   ├── game.ts
│   │   │   ├── resource.ts
│   │   │   ├── facility.ts
│   │   │   ├── transport.ts
│   │   │   ├── terrain.ts
│   │   │   ├── power.ts
│   │   │   ├── humanity.ts
│   │   │   ├── space.ts
│   │   │   ├── action.ts
│   │   │   └── event.ts
│   │   ├── client.ts               # Per-game Drizzle instance factory
│   │   └── template.ts             # Template DB copy logic (ADR-0011)
│   │
│   ├── shared/                     # Server-only shared utilities
│   │   ├── geo/
│   │   │   ├── coordinates.ts       # Lat/lng ↔ 3D vector conversions
│   │   │   ├── distance.ts          # Great-circle distance
│   │   │   └── noise.ts              # Perlin/Simplex noise for fills
│   │   └── sse/
│   │       └── event-bus.ts         # SSE broadcast for web UI updates
│   │
│   ├── utils/                      # Nuxt convention (auto-imported)
│   │   └── db.ts                   # getDb(token) helper → server/db/client
│   │
│   └── middleware/                 # Nuxt convention
│       └── token-auth.ts           # Validate token for MCP + state routes
│
├── scripts/                        # Build/data scripts (ADR-0011)
│   ├── fetch-geological-data.ts
│   └── build-template.ts
│
└── data/                           # Runtime data (gitignored)
    ├── games/
    │   ├── _template.db
    │   └── {token}.db
    └── geological/
        ├── raw/                    # Downloaded source data
        └── terrain/
```

### Domain Module Conventions

Each domain module under `server/domain/{domain}/` follows:

| File                     | Purpose                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `{domain}.service.ts`    | Core business logic — the primary public API of the domain |
| `{domain}.repository.ts` | DB queries via Drizzle; no business logic                  |
| `{domain}.validation.ts` | Input validation for that domain's operations              |
| `{domain}.constants.ts`  | Domain-specific constants (when needed)                    |
| `tools/` or `tools.ts`   | MCP tool definitions (MCP domain only)                     |

**Import rules:**

- Domains may import from `lib/types`, `server/db`, `server/shared`, and
  other domains' service files (via explicit import, not auto-import).
- Domains may NOT import from `server/api/` (no circular dependency).
- `server/api/` handlers import domain services and `server/utils`.
- `lib/types` has zero dependencies — pure type definitions only.
- Client code imports from `lib/types` and `lib/constants` only; never from
  `server/`.

### Auto-Import Boundaries

Nuxt auto-imports from `composables/`, `server/utils/`, and `components/`.
To keep domains explicit:

- `composables/` are auto-imported (Nuxt convention) — these are thin
  client-side wrappers that call `/api/` endpoints and manage reactive state.
- `server/utils/` is auto-imported — keep this minimal (the `getDb(token)`
  helper only). Domain logic is explicitly imported, not auto-imported.
- `components/` auto-import uses directory-based naming: `components/earth/`
  → `<EarthGlobe>`, `components/hud/` → `<HudResourceTracker>`, etc.

### Why Not Full DDD?

Full DDD (aggregates, value objects, domain events, bounded contexts with
separate compilation) adds ceremony that doesn't pay off for a single-process
game with one team. The pragmatic approach — feature folders with
service/repository/types — captures the core benefit: understanding a feature
by reading one directory, not hunting across technical layers.

## Naming Conventions

Use **PascalCase (StartCasing)** for all type-level constructs:

| Construct           | Convention | Example                                            |
| ------------------- | ---------- | -------------------------------------------------- |
| Classes             | PascalCase | `GameService`, `PowerGrid`                         |
| Enums               | PascalCase | `FacilityType`, `TerrainClass`, `ResourceCategory` |
| Enum members        | PascalCase | `FacilityType.Extractor`, `TerrainClass.Mountain`  |
| Interfaces / Types  | PascalCase | `GameMeta`, `TickState`, `GridStatus`              |
| Union literal types | PascalCase | `DifficultyPreset = 'Easy' \| 'Normal' \| 'Hard'`  |

Use **camelCase** for variables, functions, methods, and properties:

| Construct                  | Convention                  | Example                                        |
| -------------------------- | --------------------------- | ---------------------------------------------- |
| Functions / methods        | camelCase                   | `createGame()`, `surveyRegion()`               |
| Variables / properties     | camelCase                   | `tickCount`, `pollutionLevel`                  |
| Drizzle table objects      | camelCase                   | `games`, `facilities`, `terrainCells`          |
| File names                 | kebab-case                  | `game.service.ts`, `lose-condition.service.ts` |
| Vue components             | PascalCase                  | `EarthGlobe.vue`, `ResourceTracker.vue`        |
| Composables                | camelCase with `use` prefix | `useGame()`, `usePower()`                      |
| Constants (runtime values) | camelCase                   | `maxFacilities = 500`                          |
| Constants (config objects) | PascalCase                  | `const DifficultyPresets = { ... }`            |

### Enum Style

Prefer string-valued enums over numeric enums for readability in DB queries,
API responses, and MCP tool arguments:

```typescript
export enum FacilityType {
  Extractor = 'Extractor',
  Processor = 'Processor',
  Factory = 'Factory',
  PowerPlant = 'PowerPlant',
  // ...
}
```

String enums ensure serialized values are self-documenting (`"Extractor"` not
`0`), which matters for MCP tool responses consumed by the LLM.

## Consequences

**Positive:**

- Each domain is self-contained — reading `server/domain/power/` tells you
  everything about the power system.
- Adding a new domain means creating a new folder, not scattering files across
  `api/`, `utils/`, `types/`.
- Clear import rules prevent circular dependencies and layering violations.
- `lib/types` as shared kernel keeps client and server type-safe without
  coupling them to server internals.
- Thin API handlers are easy to test; domain services are framework-agnostic.
- Domain service isolation maps directly to the test structure (ADR-0022):
  each domain's unit tests are co-located or mirrored, matching the
  feature-folder organization.

**Negative:**

- More directories than a flat Nuxt structure; navigation requires knowing
  which domain owns what.
- Nuxt auto-import doesn't cover `server/domain/` — explicit imports required
  (intentional, but more boilerplate).
- `lib/` is a non-standard Nuxt directory; needs `tsconfig` path alias or
  relative imports. Configured via `nuxt.config.ts` `alias` or `tsconfig`
  `paths`.

## Alternatives Considered

- **Flat Nuxt defaults** (`server/api/` + `server/utils/` + `composables/`):
  Simple initially but scatters domain logic across technical layers as the
  project grows. Rejected — the project already has 9 distinct domains.
- **Full DDD with aggregates and domain events**: Too much ceremony for a
  single-process game. The pragmatic feature-folder approach captures the
  organizational benefit without the overhead.
- **Modules per domain (Nuxt modules)**: Each domain as a Nuxt module is
  over-engineered; modules are for reusable packages, not internal feature
  grouping.
- **`shared/` instead of `lib/`**: `shared/` conflicts with Nuxt's reserved
  directory awareness. `lib/` is neutral and conventional for a shared kernel.
