# ADR-0027: Server Architecture — IoC, DI & Design Patterns

| Field      | Value                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------- |
| Status     | Proposed                                                                                           |
| Date       | 2026-07-10                                                                                         |
| Deciders   | Project owner                                                                                      |
| Relates to | ADR-0001, ADR-0004, ADR-0005, ADR-0006, ADR-0017, ADR-0019, ADR-0022                               |
| Supersedes | ADR-0017 (code organization & DDD structure — directory layout, naming, and service patterns)     |

## Context

ADR-0017 proposed a pragmatic DDD structure with feature folders, service
files, and repositories. The implementation diverged significantly:

- **No repository pattern** — all DB access is inline via `createGameDb(token)`
  + Drizzle schema in service files. Every function takes `token` as its first
  argument and opens its own DB connection internally.
- **Monolithic `tick.ts`** (760 lines) — all 8 tick processors (resource
  regen, population, environment, forest, construction, production, transport,
  research) in one file with no separation of concerns.
- **Monolithic `dispatcher.ts`** (347 lines) — a giant `switch` statement for
  40+ MCP tools, plus event emission, action logging, and game state queries
  all in the same function.
- **Free functions, not services** — domains export functions, not classes.
  There is no way to inject dependencies, mock the DB in tests, or compose
  services without every function independently opening a DB connection.
- **No lifecycle management** — singletons (event bus, tool registry) are
  ad-hoc module-level variables. Per-request state (DB connection, game
  scope) is implicit via the `token` parameter pattern.

The core problem: **there is no dependency inversion**. Services depend
directly on concrete DB access (`createGameDb`), Drizzle schema imports, and
each other's free functions. This makes the system untestable in isolation,
tightly coupled, and impossible to extend without modifying existing files.

## Decision

Adopt an **IoC container with dependency injection** on the server, using a
**service pattern** with interfaces as contracts. This replaces the current
free-function + token-parameter architecture with a layered, injectable,
testable design.

### 1. IoC Container — Custom, Type-Safe

Use a **custom minimal IoC container** — no `tsyringe`, no `inversifyJS`, no
`reflect-metadata`, no decorators. Dependencies are declared via **explicit
factory functions** in the binding registration.

#### 1.1 Typed Tokens

TypeScript interfaces don't exist at runtime, so they cannot serve as binding
keys directly. Instead, use a generic `Token<T>` class that carries the
interface type at compile time and a unique key at runtime:

```typescript
// server/domains/ioc/Token.ts

export class Token<T> {
  private static counter = 0
  public readonly key: symbol

  constructor(description: string) {
    this.key = Symbol(`${description}:${Token.counter++}`)
  }
}
```

Tokens are defined once, alongside their interfaces:

```typescript
// server/domains/game/repositories/IGameRepository.ts

export interface IGameRepository {
  getMeta(): GameMeta
  updateTick(tick: number, now: string): void
  setStatus(status: GameStatus): void
  beginTransaction<T>(fn: () => T): T
}

export const IGameRepository = new Token<IGameRepository>('IGameRepository')
```

The container's `bind` and `resolve` methods are generic, constrained to the
token's type parameter. TypeScript validates that the factory returns the
correct type and that `resolve` returns the correct type — **no string-based
resolution, no `any` casts, no runtime type errors from mismatched bindings**.

```typescript
// Binding — type-checked: factory must return IGameRepository
container.bind(IGameRepository, (c) => new GameRepository(c.resolve(IDbConnection)), Lifecycle.Scoped)

// Resolution — type-checked: repo is IGameRepository, not any
const repo = container.resolve(IGameRepository)
```

#### 1.2 Container API

```typescript
// server/domains/ioc/Container.ts

export type Factory = (container: Container) => unknown

export class Container {
  private bindings = new Map<symbol, { factory: Factory, lifecycle: Lifecycle }>()
  private singletons = new Map<symbol, unknown>()
  private scopedInstances = new Map<symbol, unknown>()
  private parent: Container | null

  bind<T>(token: Token<T>, factory: (c: Container) => T, lifecycle: Lifecycle): void
  resolve<T>(token: Token<T>): T
  createScope(): Container
}
```

- `bind` registers a factory + lifecycle for a token.
- `resolve` instantiates (or reuses) the binding. If the token isn't bound in
  this container, it delegates to the parent.
- `createScope` creates a child container. Scoped instances are per-scope;
  singletons are shared across all scopes.

#### 1.3 Module Registration

Each domain exports a **Module** — a function that registers that domain's
bindings on a container:

```typescript
// server/domains/game/GameModule.ts

import type { Container } from '../ioc/Container'
import { Lifecycle } from '../ioc/Lifecycle'

export function registerGameModule(container: Container): void {
  container.bind(IGameRepository, c => new GameRepository(c.resolve(IDbConnection)), Lifecycle.Scoped)
  container.bind(GameService, c => new GameService(
    c.resolve(IGameRepository),
    c.resolve(ITickProcessor),
  ), Lifecycle.Scoped)
  // ... ticks, factories, etc.
}
```

The composition root (Nitro plugin) registers all domain modules on the root
container at startup.

### 2. Lifecycles

Three lifecycles:

| Lifecycle    | Behavior                                                                | Examples                                           |
| ------------ | ----------------------------------------------------------------------- | -------------------------------------------------- |
| **Singleton**    | One instance for the entire application. Shared across all scopes.      | `IEventBus`, `IToolRegistry`, `IMcpServer`              |
| **Scoped**       | One instance per scope (per request / per tool call).                   | `IDbConnection`, `IGameRepository`, `IFacilityService`, `ITickProcessor` |
| **Transient**    | New instance every `resolve()`.                                         | Factories, builders, result DTOs                   |

#### Request Scoping

Each MCP tool call or API request creates a **child scope** from the root
container. The scope binds `IDbConnection` to a DB connection for the specific
game token. All scoped services resolved within that scope share the same DB
connection:

```
RootContainer (singletons: EventBus, ToolRegistry, McpServer)
  │
  ├─ RequestScope (token: "abc123")
  │   ├─ IDbConnection → DbConnection("data/games/abc123.db")  [scoped]
  │   ├─ IGameRepository → GameRepository(db)                  [scoped]
  │   ├─ IFacilityService → FacilityService(repo, ...)         [scoped]
  │   └─ ITickProcessor → TickProcessor(repos, services, ...)  [scoped]
  │
  ├─ RequestScope (token: "def456")
  │   └─ ... (independent instances)
```

### 3. Domain Directory Structure

```
server/
  domains/
    ioc/
      Container.ts              # IoC container implementation
      Token.ts                  # Generic typed token
      Lifecycle.ts              # Singleton | Scoped | Transient enum
      Module.ts                 # Module registration interface
      Plugin.ts                 # Nitro plugin — composition root

    game/
      GameService.ts            # Game CRUD, state snapshot
      GameFactory.ts            # Creates new games from template
      GameModule.ts             # Registers game domain bindings
      Models/
        GameMeta.ts             # Interface — game metadata
        TickResult.ts           # Interface — tick processing result
        DifficultyPreset.ts     # Type — difficulty levels
        GameStatus.ts           # Enum — active, paused, game over
      Repositories/
        IGameRepository.ts      # Interface + Token<IGameRepository>
        GameRepository.ts       # Drizzle implementation
      Ticks/
        LoseConditionTick.ts    # Checks lose condition after tick

    facilities/
      FacilityService.ts        # Build, demolish, list, details
      FacilityFactory.ts        # Creates facility entities
      FacilityModule.ts
      Models/
        Facility.ts             # Interface — facility entity
        FacilityBuffer.ts       # Interface — input/output buffers
        ConstructionProgress.ts # Interface — construction state
      Repositories/
        IFacilityRepository.ts
        FacilityRepository.ts
      Ticks/
        ConstructionTick.ts     # Advances construction progress
        ProductionTick.ts       # Processes production targets

    resources/
      ResourceService.ts        # Stockpile queries, resource overview
      ResourceModule.ts
      Models/
        ResourceStock.ts        # Interface — stockpile entry
        ResourceDeposit.ts      # Interface — surveyed deposit
      Repositories/
        IResourceRepository.ts
        ResourceRepository.ts
      Ticks/
        RegenTick.ts            # Renewable resource regeneration

    humanity/
      HumanityService.ts        # Population, welfare queries
      HumanityModule.ts
      Models/
        PopulationState.ts      # Interface
        EnvironmentState.ts     # Interface
      Repositories/
        IHumanityRepository.ts
        HumanityRepository.ts
      Ticks/
        PopulationTick.ts       # Logistic population growth
        EnvironmentTick.ts      # Pollution, water, biodiversity updates

    forest/
      ForestService.ts          # Forest grid queries
      ForestModule.ts
      Models/
        ForestCell.ts           # Interface — density, max_density
      Repositories/
        IForestRepository.ts
        ForestRepository.ts
      Ticks/
        ForestGridTick.ts       # Regeneration + facility impact

    transport/
      TransportService.ts       # Build, demolish, list transports
      TransportModule.ts
      Models/
        TransportRoute.ts       # Interface
        TransportFlow.ts        # Interface — per-tick flow state
      Repositories/
        ITransportRepository.ts
        TransportRepository.ts
      Ticks/
        TransportFlowTick.ts    # Moves resources along routes

    tech/
      TechService.ts            # Research, tech tree queries
      TechModule.ts
      Models/
        TechNode.ts             # Interface
        ResearchProgress.ts     # Interface
      Repositories/
        ITechRepository.ts
        TechRepository.ts
      Ticks/
        ResearchTick.ts         # Advances active research

    power/
      PowerService.ts           # Generation, consumption, grid status
      PowerModule.ts
      Models/
        PowerGridState.ts       # Interface
        PowerConnection.ts      # Interface
      Repositories/
        IPowerRepository.ts
        PowerRepository.ts

    space/
      SpaceService.ts           # Space facilities, missions
      SpaceModule.ts
      Models/
        SpaceFacility.ts        # Interface
        Mission.ts              # Interface
      Repositories/
        ISpaceRepository.ts
        SpaceRepository.ts

    terrain/
      TerrainService.ts         # Elevation lookup, terrain classification
      TerrainModule.ts
      Models/
        TerrainCell.ts          # Interface
        ElevationData.ts        # Interface
      Repositories/
        ITerrainRepository.ts
        TerrainRepository.ts

    tick/
      TickProcessor.ts          # Orchestrates all domain ticks
      ITickProcessor.ts         # Interface + Token
      TickModule.ts             # Registers tick orchestrator + imports all tick modules

    mcp/
      McpServer.ts              # MCP HTTP/SSE transport
      McpDispatcher.ts          # Resolves + dispatches tools via ToolRegistry
      ToolRegistry.ts           # Central registry — domains register tools here
      IToolRegistry.ts          # Interface + Token
      McpModule.ts
      Tools/
        GameTools.ts            # get_game_state, get_game_overview, etc.
        ResourceTools.ts        # survey_region, get_resource_overview, etc.
        FacilityTools.ts        # build_facility, demolish_facility, etc.
        TransportTools.ts       # build_transport, assign_route, etc.
        PowerTools.ts           # connect_power, get_power_status, etc.
        TechTools.ts            # start_research, get_tech_tree, etc.
        SpaceTools.ts           # launch_mission, assign_space_crew, etc.
        QueryTools.ts           # search_actions, get_action_log, etc.

    events/
      EventBus.ts               # SSE broadcast for web UI
      IEventBus.ts              # Interface + Token
      EventsModule.ts

    db/
      DbConnection.ts           # Wraps better-sqlite3 + Drizzle instance
      IDbConnection.ts          # Interface + Token
      DbModule.ts

  api/                          # Thin Nitro route handlers (unchanged)
    game/
      create.post.ts
      [token].get.ts
      [token].delete.ts
    mcp/
      sse.[token].get.ts
      messages.[token].post.ts
    health.get.ts
    events.get.ts

  db/                           # Drizzle schema definitions (shared infrastructure)
    schema/
      game.ts
      facility.ts
      resource.ts
      transport.ts
      terrain.ts
      power.ts
      humanity.ts
      forest.ts
      tech.ts
      space.ts
      action.ts
      event.ts
    client.ts                   # DB path helpers (getDataDir, getGameDbPath, etc.)

  shared/                       # Server-only shared utilities
    geo/
      Coordinates.ts
      Distance.ts
      Noise.ts

  tasks/                        # Background tasks
    GameCleanup.ts

  utils/                        # Nuxt auto-import helpers
    db.ts                       # getDb(token) → legacy compatibility if needed
```

### 4. Models as Interfaces

Models are **anemic interfaces** — pure data shapes with no behavior. All
business logic lives in services. This is intentionally not full DDD (no
aggregate roots, no value objects with behavior, no domain events on
entities).

```typescript
// server/domains/facilities/Models/Facility.ts

export interface Facility {
  id: number
  type: FacilityType
  lat: number
  lon: number
  status: FacilityStatus
  constructionProgress: number
  productionTarget: string | null
  // ...
}
```

**External models without type info** (e.g., Drizzle query results that return
plain objects) are typed in the repository layer and returned as interfaces:

```typescript
// server/domains/facilities/Repositories/FacilityRepository.ts

export class FacilityRepository implements IFacilityRepository {
  constructor(private readonly db: IDbConnection) {}

  findById(id: number): Facility | undefined {
    const row = this.db.query.facilities.findFirst({ where: eq(schema.facilities.id, id) })
    if (!row) return undefined
    return this.mapRow(row)  // Maps untyped/partially-typed row → Facility interface
  }

  private mapRow(row: typeof schema.facilities.$inferSelect): Facility {
    return {
      id: row.id,
      type: row.type as FacilityType,
      lat: row.lat,
      lon: row.lon,
      status: row.status as FacilityStatus,
      constructionProgress: row.constructionProgress,
      productionTarget: row.productionTarget,
    }
  }
}
```

### 5. Service Pattern

Services are **classes** that implement interfaces. They receive dependencies
via constructor injection. Services contain all business logic; repositories
handle only DB access.

```typescript
// server/domains/facilities/FacilityService.ts

export class FacilityService {
  constructor(
    private readonly facilityRepo: IFacilityRepository,
    private readonly resourceRepo: IResourceRepository,
    private readonly terrainService: ITerrainService,
  ) {}

  build(type: FacilityType, lat: number, lon: number): BuildResult {
    // Validate terrain
    const terrain = this.terrainService.getTerrainAt(lat, lon)
    if (!this.canBuildOn(type, terrain))
      return { success: false, error: 'Invalid terrain for facility type' }

    // Check resources
    const cost = CONSTRUCTION_COSTS[type]
    if (!this.resourceRepo.hasSufficient(cost))
      return { success: false, error: 'Insufficient resources' }

    // Deduct + create
    this.resourceRepo.deduct(cost)
    const facility = this.facilityRepo.create(type, lat, lon)
    return { success: true, facility }
  }

  demolish(id: number): DemolishResult { /* ... */ }
  list(): Facility[] { /* ... */ }
  getDetails(id: number): FacilityDetails | undefined { /* ... */ }
}
```

### 6. Tick Processing — Distributed & Orchestrated

Each domain owns its tick logic in its own `Ticks/` directory. The central
`tick` domain contains a `TickProcessor` that orchestrates all domain ticks in
order.

```typescript
// server/domains/tick/TickProcessor.ts

export class TickProcessor {
  constructor(
    private readonly gameRepo: IGameRepository,
    private readonly regenTick: RegenTick,
    private readonly populationTick: PopulationTick,
    private readonly environmentTick: EnvironmentTick,
    private readonly forestGridTick: ForestGridTick,
    private readonly constructionTick: ConstructionTick,
    private readonly productionTick: ProductionTick,
    private readonly transportFlowTick: TransportFlowTick,
    private readonly researchTick: ResearchTick,
    private readonly loseConditionTick: LoseConditionTick,
  ) {}

  process(): TickResult {
    const meta = this.gameRepo.getMeta()
    if (meta.status === GameStatus.GameOver || meta.status === GameStatus.Paused)
      return { tickCount: meta.tickCount, status: meta.status, advanced: false }

    const newTick = meta.tickCount + 1
    this.gameRepo.beginTransaction(() => {
      this.gameRepo.updateTick(newTick, new Date().toISOString())
      this.regenTick.process(newTick)
      this.populationTick.process(newTick)
      this.environmentTick.process(newTick)
      this.forestGridTick.process(newTick)
      this.constructionTick.process(newTick)
      this.productionTick.process(newTick)
      this.transportFlowTick.process(newTick)
      this.researchTick.process(newTick)
      this.loseConditionTick.process(newTick)
    })

    const updated = this.gameRepo.getMeta()
    return { tickCount: newTick, status: updated.status, advanced: true }
  }
}
```

Each tick class is small and focused on one concern:

```typescript
// server/domains/facilities/Ticks/ConstructionTick.ts

export class ConstructionTick {
  constructor(private readonly facilityRepo: IFacilityRepository) {}

  process(tick: number): void {
    const underConstruction = this.facilityRepo.findUnderConstruction()
    for (const facility of underConstruction) {
      const progress = facility.constructionProgress + 1
      if (progress >= CONSTRUCTION_TIME[facility.type])
        this.facilityRepo.updateStatus(facility.id, FacilityStatus.Active)
      else
        this.facilityRepo.updateConstructionProgress(facility.id, progress)
    }
  }
}
```

Each tick class implements a common interface:

```typescript
// server/domains/tick/ITick.ts

export interface ITick {
  process(tick: number): void
}
```

### 7. MCP Tool Registry — Modular Dispatch

The `ToolRegistry` replaces the monolithic switch statement. Each domain
registers its own tools. The registry dispatches by tool name.

```typescript
// server/domains/mcp/ToolRegistry.ts

export interface ToolHandler {
  (args: Record<string, unknown>): ToolCallResult
}

export interface IToolRegistry {
  register(name: string, handler: ToolHandler): void
  execute(name: string, args: Record<string, unknown>): ToolCallResult
  getToolDefinitions(): McpToolDef[]
}

export class ToolRegistry implements IToolRegistry {
  private tools = new Map<string, ToolHandler>()
  private definitions = new Map<string, McpToolDef>()

  register(name: string, definition: McpToolDef, handler: ToolHandler): void {
    this.tools.set(name, handler)
    this.definitions.set(name, definition)
  }

  execute(name: string, args: Record<string, unknown>): ToolCallResult {
    const handler = this.tools.get(name)
    if (!handler)
      return { success: false, error: `Unknown tool: ${name}` }
    return handler(args)
  }

  getToolDefinitions(): McpToolDef[] {
    return Array.from(this.definitions.values())
  }
}
```

Each domain has a `Tools/` class that registers its tools:

```typescript
// server/domains/facilities/FacilityTools.ts

export class FacilityTools {
  constructor(private readonly facilityService: FacilityService) {}

  register(registry: IToolRegistry): void {
    registry.register('build_facility', {
      name: 'build_facility',
      description: 'Build a facility at the given coordinates',
      inputSchema: { /* JSON Schema */ },
    }, (args) => {
      return this.facilityService.build(
        args.type as FacilityType,
        args.lat as number,
        args.lon as number,
      )
    })

    registry.register('demolish_facility', { /* ... */ }, (args) => {
      return this.facilityService.demolish(args.id as number)
    })

    registry.register('list_facilities', { /* ... */ }, () => {
      return this.facilityService.list()
    })
  }
}
```

Tool registration happens at scope creation — each domain's tools are
registered on the scoped `ToolRegistry` instance:

```typescript
// server/domains/mcp/McpModule.ts

export function registerMcpModule(container: Container): void {
  container.bind(IToolRegistry, c => {
    const registry = new ToolRegistry()
    // Each domain registers its tools
    new FacilityTools(c.resolve(FacilityService)).register(registry)
    new ResourceTools(c.resolve(ResourceService)).register(registry)
    new TransportTools(c.resolve(TransportService)).register(registry)
    new PowerTools(c.resolve(PowerService)).register(registry)
    new TechTools(c.resolve(TechService)).register(registry)
    new SpaceTools(c.resolve(SpaceService)).register(registry)
    new GameTools(c.resolve(GameService)).register(registry)
    new QueryTools(c.resolve(GameService), c.resolve(IEventBus)).register(registry)
    return registry
  }, Lifecycle.Scoped)
}
```

### 8. Nitro Integration

A Nitro plugin serves as the **composition root** — it initializes the root
container and registers all domain modules at startup:

```typescript
// server/domains/ioc/Plugin.ts

import { Container } from './Container'
import { Lifecycle } from './Lifecycle'
// ... domain module imports

export default defineNitroPlugin(() => {
  const container = new Container()

  // Infrastructure
  registerDbModule(container)
  registerEventsModule(container)

  // Domains
  registerGameModule(container)
  registerFacilitiesModule(container)
  registerResourcesModule(container)
  registerHumanityModule(container)
  registerForestModule(container)
  registerTransportModule(container)
  registerTechModule(container)
  registerPowerModule(container)
  registerSpaceModule(container)
  registerTerrainModule(container)

  // Cross-cutting
  registerTickModule(container)
  registerMcpModule(container)

  // Store on Nitro app for access in route handlers
  useNitroApp().container = container
})
```

API route handlers create a scoped container per request:

```typescript
// server/api/mcp/messages.[token].post.ts

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  const container = useNitroApp().container as Container

  // Create request scope with game-specific DB connection
  const scope = container.createScope()
  scope.bind(IDbConnection, () => new DbConnection(getGameDbPath(token!)), Lifecycle.Scoped)

  // Resolve + dispatch
  const dispatcher = scope.resolve(McpDispatcher)
  const result = dispatcher.executeTool(body.tool, body.arguments)

  return result
})
```

### 9. Naming Conventions

| Construct                    | Convention | Example                                      |
| ---------------------------- | ---------- | -------------------------------------------- |
| Files (classes, services)    | PascalCase | `GameService.ts`, `FacilityRepository.ts`   |
| Files (interfaces + tokens)  | PascalCase | `IGameRepository.ts`, `ITickProcessor.ts`   |
| Files (factories)            | PascalCase | `GameFactory.ts`, `FacilityFactory.ts`      |
| Files (models)               | PascalCase | `GameMeta.ts`, `Facility.ts`                 |
| Files (modules)              | PascalCase | `GameModule.ts`, `FacilitiesModule.ts`       |
| Files (ticks)                | PascalCase | `ConstructionTick.ts`, `RegenTick.ts`        |
| Files (tools)                | PascalCase | `FacilityTools.ts`, `ResourceTools.ts`       |
| Directories                  | lowercase  | `game/`, `facilities/`, `mcp/`               |
| Subdirectories               | PascalCase | `Models/`, `Repositories/`, `Ticks/`, `Tools/` |
| Classes                      | PascalCase | `GameService`, `FacilityRepository`          |
| Interfaces                   | PascalCase | `IGameRepository`, `ITickProcessor`          |
| Enums                        | PascalCase | `GameStatus`, `FacilityType`                 |
| Token variables              | PascalCase | `const IGameRepository = new Token<...>(...)`|
| Methods / functions          | camelCase  | `buildFacility()`, `processTick()`           |
| Variables / properties       | camelCase  | `tickCount`, `constructionProgress`          |
| Constants (config objects)   | PascalCase | `ConstructionCosts`, `FacilityImpact`        |
| Constants (runtime values)   | camelCase  | `maxFacilities = 500`                        |

**Nuxt client-side conventions are unchanged** — Vue components use
PascalCase filenames (`EarthGlobe.vue`), composables use camelCase with `use`
prefix (`useGameSSE.ts`), Pinia stores use camelCase, and pages use
kebab-case as per Nuxt conventions. Auto-imports remain enabled for
`composables/`, `components/`, and `server/utils/`.

### 10. Import Rules

- `server/domains/{domain}/` may import from:
  - Its own `Models/`, `Repositories/`, `Ticks/`, `Tools/`
  - Other domains' interfaces (`IXxxService`, `IXxxRepository`) and tokens
  - `server/domains/ioc/` (`Container`, `Token`, `Lifecycle`)
  - `server/db/schema/` (repositories only — Drizzle table definitions)
  - `server/shared/` (geo utilities)
  - `lib/types/` and `lib/constants/` (shared kernel)
- `server/domains/{domain}/` may **NOT** import from:
  - `server/api/` (no circular dependency)
  - Other domains' concrete implementations (only their interfaces)
- `server/api/` handlers import `Container` and domain interfaces only.
- `server/db/schema/` has zero domain dependencies — pure Drizzle table defs.
- `lib/types/` and `lib/constants/` have zero dependencies — pure types/constants.

### 11. Testing Impact

The DI architecture enables **true unit testing** with mock injection. Tests
can create a container, bind mock implementations, and resolve services with
injected mocks — no real DB required:

```typescript
// Example: unit test with mock repository
const container = new Container()
container.bind(IGameRepository, () => mockGameRepository, Lifecycle.Singleton)
container.bind(IFacilityRepository, () => mockFacilityRepository, Lifecycle.Singleton)
container.bind(ITerrainService, () => mockTerrainService, Lifecycle.Singleton)
container.bind(FacilityService, c => new FacilityService(
  c.resolve(IFacilityRepository),
  c.resolve(IResourceRepository),
  c.resolve(ITerrainService),
), Lifecycle.Transient)

const service = container.resolve(FacilityService)
expect(service.build(FacilityType.Extractor, 45, -120).success).toBe(true)
```

Integration tests can use real implementations with a test DB (as they do
today via `test/setup.ts`).

This ADR does not change the testing strategy (ADR-0022) — it enables it.
The repository abstraction that ADR-0022 assumed but was never implemented is
now a first-class concern.

## Consequences

**Positive:**

- **Testability** — services can be unit-tested with mock repositories. No
  real DB needed for logic tests. Integration tests use real DB via scoped
  container.
- **Single DB connection per request** — the scoped `IDbConnection` is shared
  by all services in one request, eliminating the current pattern of each
  function independently opening a DB connection.
- **Decoupled domains** — domains depend on each other's interfaces, not
  concrete implementations. Adding a new facility type doesn't require
  modifying `tick.ts` or `dispatcher.ts`.
- **Modular MCP tools** — adding a new tool means adding a method to a
  domain's `Tools/` class and registering it. No switch statement to modify.
- **Distributed tick processing** — each domain's tick logic is isolated in
  its own file. The `TickProcessor` orchestrates; individual ticks are
  independently testable.
- **Clear lifecycle management** — singletons, scoped, and transient are
  explicit, not implicit module-level variables.
- **Type-safe DI** — TypeScript validates all bindings and resolutions. No
  string-based lookups, no `any` casts, no runtime type mismatches.

**Negative:**

- **More boilerplate** — each domain has interface + token + implementation +
  module registration. This is the cost of explicit, type-safe DI.
- **Custom container maintenance** — a custom IoC container must be
  maintained. It's ~100 lines, but it's code we own, not a library.
- **Larger migration** — moving from free functions to services + repositories
  is a significant refactor of all existing domain code.
- **More files** — each domain has 5-10 files instead of 1-2. Navigation
  requires understanding the directory structure.

## Alternatives Considered

### tsyringe (Microsoft)

Lightweight DI library with decorator-based injection (`@injectable()`,
`@inject()`). Requires `reflect-metadata` and `emitDecoratorMetadata: true` in
tsconfig. Type-safe via runtime metadata. Rejected — adds a runtime
dependency, requires decorator metadata, and the explicit factory approach is
simpler and equally type-safe without runtime magic.

### inversifyJS

Feature-rich IoC container with binding decorators, middleware, and
activation hooks. Uses string or `Symbol`-based tokens. Rejected — heavier
than needed, string-based token pattern is what we're explicitly avoiding, and
the explicit factory approach gives us the same type safety with less
complexity.

### Abstract classes as DI tokens

Use `abstract class IGameRepository` as both the contract and the runtime
binding key (classes exist at runtime, interfaces don't). Rejected — user
prefers interfaces for contracts. The `Token<T>` approach provides the same
type safety with pure interfaces.

### String-based tokens

`container.bind('IGameRepository', ...)` and `container.resolve<IGameRepository>('IGameRepository')`.
Rejected — strings are not type-checked. A typo in the string causes a runtime
error, not a compile error. The `Token<T>` approach eliminates this class of
bug entirely.

### Keeping the current free-function architecture

Rejected — the current architecture is the problem this ADR solves. No
dependency inversion, no testability, monolithic files, no lifecycle
management.