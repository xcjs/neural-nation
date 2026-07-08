# ADR-0022: Testing Strategy

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0001, ADR-0017, ADR-0018 |

## Context

The project is a complex game with a simulation engine (tick processing,
resource balancing, supply chain, power grid, terrain), an MCP server, and
a 3D web UI. Without a testing strategy, regressions in the simulation
logic (recipes, resource depletion, transport routing, tech tree
prerequisites) will be hard to catch — the system has too many interacting
parts to verify manually.

The user has chosen **Vitest** as the test framework.

## Decision

### Framework: Vitest

Use **Vitest** for all automated tests. Vitest integrates naturally with
the Nuxt/Vite toolchain (ADR-0001), supports TypeScript out of the box, and
provides watch mode, parallel execution, and snapshot testing.

### Test Layers

#### 1. Unit Tests — Domain Services

Each domain service (ADR-0017) gets a test file in a co-located `__tests__/`
directory or a mirrored `tests/unit/` directory:

```
tests/
  unit/
    domain/
      game/
        tick.service.test.ts
        lose-condition.service.test.ts
        starting-resources.service.test.ts
        cleanup.service.test.ts
      resources/
        deposit.service.test.ts
        regeneration.service.test.ts
        resource.service.test.ts
      facilities/
        facility.service.test.ts
        production.service.test.ts
        buffer.service.test.ts
        placement.service.test.ts
      transport/
        routing.service.test.ts
        flow.service.test.ts
      terrain/
        terrain.service.test.ts
      power/
        power.service.test.ts
        grid.service.test.ts
      humanity/
        population.service.test.ts
        environment.service.test.ts
        incident.service.test.ts
      space/
        space.service.test.ts
        launch.service.test.ts
      mcp/
        tool-registry.test.ts
        search.service.test.ts
```

Unit tests mock the Drizzle repository layer (database access) and test
business logic in isolation. Each test creates an in-memory game state or
uses a fixture.

#### 2. Integration Tests — Database & Repositories

Integration tests exercise the Drizzle ORM layer against a real (in-memory
or temp-file) SQLite database:

```
tests/
  integration/
    db/
      schema.test.ts              # Schema creation, migrations
      template.test.ts             # Template DB copy + seed verification
      game.repository.test.ts
      resource.repository.test.ts
      facility.repository.test.ts
      transport.repository.test.ts
      terrain.repository.test.ts
      power.repository.test.ts
      humanity.repository.test.ts
      space.repository.test.ts
      recipe.test.ts               # Recipe data integrity (inputs/outputs match)
      tech-tree.test.ts            # Tech prerequisites, unlocks consistency
```

Integration tests use a temporary SQLite file (created in `os.tmpdir()`,
cleaned up after each test) or `:memory:` SQLite. They verify that queries
return expected data and that schema constraints (foreign keys, NOT NULL,
uniqueness) are enforced.

#### 3. API Tests — Nitro Route Handlers

API tests hit the Nitro server endpoints via `supertest` or Nuxt's test
utilities:

```
tests/
  api/
    games.test.ts                  # Create, get, delete game
    state.test.ts                   # Resource overview, facilities, actions
    events.test.ts                  # SSE event stream
    mcp.test.ts                     # MCP SSE + messages endpoints
```

These test the thin API controllers (ADR-0017) end-to-end through the HTTP
layer, including token validation, error responses, and pagination.

#### 4. Game Simulation Tests — Tick Processing

A dedicated test suite for the game simulation loop (ADR-0006):

```
tests/
  simulation/
    tick.test.ts                    # Full tick cycle: production → transport → power → environment → lose check
    production-chain.test.ts        # Multi-facility supply chain producing end-to-end
    resource-depletion.test.ts     # Lose condition triggers correctly
    population-growth.test.ts      # Logistic model, welfare modifiers
    environmental-impact.test.ts    # Pollution accumulation, incident triggers
    tech-progression.test.ts       # Research → unlock → build advanced facility
    space-chain.test.ts             # Spaceport → station → asteroid mining
    terrain-routing.test.ts        # Transport blocked by mountains, tunnel modifier
```

These tests create a full game DB with seeded data, run multiple ticks, and
assert the resulting state. They are slower than unit tests but catch
integration bugs across domains.

#### 5. Component Tests — Vue Components

Vue component tests use Vitest + `@vue/test-utils`:

```
tests/
  components/
    hud/
      ResourceTracker.test.ts
      EventFeed.test.ts
      ActionConsole.test.ts
      TechTreePanel.test.ts
    game/
      NewGameForm.test.ts
      GameOverOverlay.test.ts
```

Component tests verify rendering, props, events, and reactive state
changes. They mock API calls (via `vi.mock`) and test component behavior,
not full integration.

### Test Fixtures

Shared test fixtures live in `tests/fixtures/`:

```
tests/
  fixtures/
    game-state.ts          # Factory for in-memory game state objects
    mock-db.ts              # Mock Drizzle repository helpers
    seed-data.ts            # Minimal seed data (few resources, 1 facility, 1 transport)
    recipes.ts              # A subset of recipes for testing production chains
    tech-tree.ts            # A subset of tech nodes for testing research
    terrain-grid.ts         # Small terrain grid (10x10) for routing tests
```

### Test Data: Minimal Seed Database

For integration and simulation tests, a **minimal seed DB** fixture is
created programmatically (not the full template DB). It includes:

- 5 resource deposits (iron, coal, water, wood, limestone)
- 3 recipes (Iron Smelting, Concrete, Basic Power)
- 2 tech nodes (Basic Extraction, Basic Processing — both pre-completed)
- 10x10 terrain grid (mixed terrain classes)
- 0 facilities (tests build them as needed)

This keeps tests fast and deterministic.

### Coverage Targets

| Layer | Target Coverage |
|---|---|
| Domain services (unit) | ≥ 90% |
| Repositories (integration) | ≥ 80% |
| API controllers | ≥ 80% |
| Simulation (tick) | ≥ 85% |
| Vue components | ≥ 60% |

Coverage is measured via `vitest --coverage` with `@vitest/coverage-v8`.

### Running Tests

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:simulation": "vitest run tests/simulation",
    "test:api": "vitest run tests/api",
    "test:components": "vitest run tests/components"
    }
}
```

### Vitest Configuration

`vitest.config.ts` at project root:

```typescript
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'node',           // default; components override to 'jsdom'
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['server/domain/**/*.ts', 'server/api/**/*.ts'],
      exclude: ['**/*.test.ts', '**/__tests__/**'],
    },
    testTimeout: 30000,            // simulation tests may be slow
  },
})
```

Component tests override the environment per-file:
```typescript
// @vitest-environment jsdom
```

### CI Integration

Tests run on every push via GitHub Actions (or equivalent):
1. `npm ci`
2. `npm run test:coverage`
3. Upload coverage report as artifact
4. Fail if coverage drops below targets

## Consequences

**Positive:**
- Vitest integrates seamlessly with the Nuxt/Vite toolchain — no separate
  build step for tests.
- Domain service unit tests catch logic bugs early (recipe scaling, power
  grid balancing, terrain routing) before they affect the simulation.
- Simulation tests verify cross-domain interactions (production → transport
  → power → environment → lose condition) that unit tests miss.
- Coverage targets ensure domain logic (the core of the game) is
  well-tested.
- Co-located or mirrored test structure matches the DDD organization
  (ADR-0017), making it easy to find tests for a domain.

**Negative:**
- Simulation tests are slower (full DB + multi-tick) — they run less
  frequently in watch mode. Mitigated by separate test scripts.
- Maintaining fixtures requires discipline — as recipes/tech tree evolve,
  fixtures must be updated.
- 3D visualization (TresJS/Three.js) is not covered by component tests —
  visual regressions require manual verification. Acceptable for v1.
- `@nuxt/test-utils` adds a dependency but is the standard for Nuxt testing.

## Alternatives Considered

- **Jest**: Rejected — Vitest is the natural choice for Vite-based projects
  (Nuxt 3 uses Vite). Jest requires more configuration and doesn't integrate
  as cleanly.
- **Playwright for E2E**: Valuable for testing the full web UI + MCP flow,
  but heavy for v1. Can be added later for smoke tests of the complete
  player experience (create game → copy MCP URL → connect LLM → observe
  ticks).
- **No component tests (only logic)**: Rejected — HUD panels (resource
  tracker, tech tree, action console) have enough interactive logic to
  warrant component tests.
- **Full template DB in tests**: Rejected — the full template DB is large
  (~840K terrain cells, thousands of deposits). Tests use minimal fixtures
  for speed and determinism.