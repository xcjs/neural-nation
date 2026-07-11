# Neural Nation — Architecture Decision Records

ADR index for the Neural Nation project. Each ADR documents a key architectural
decision, its context, and consequences.

## Index

| ADR                                                        | Title                                                                                 | Status   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| [0001](0001-project-architecture.md)                       | Project Architecture (Nuxt/Vue/TS/TresJS/Nitro)                                       | Proposed |
| [0002](0002-earth-visualization.md)                        | 3D Earth Visualization (TresJS, wireframe/holographic)                                | Proposed |
| [0003](0003-resource-distribution.md)                      | Resource Distribution Model (real geological data, periodic table)                    | Proposed |
| [0004](0004-mcp-server-architecture.md)                    | MCP Server Architecture (HTTP/SSE, token-scoped, resource tools)                      | Proposed |
| [0005](0005-per-game-sqlite-databases.md)                  | Per-Game SQLite Databases (token-named, Nitro-hosted)                                 | Proposed |
| [0006](0006-game-loop-and-player-interaction.md)           | Game Loop & Player Interaction (passive overseer, BYO LLM client)                     | Proposed |
| [0007](0007-facility-and-supply-chain.md)                  | Facility & Supply Chain System (full chain, explicit transport)                       | Proposed |
| [0008](0008-visual-representation-of-facilities.md)        | Visual Representation of Facilities (glowing primitives + particle clouds)            | Proposed |
| [0009](0009-game-identity-persistence-win-state.md)        | Game Identity, Persistence & Win State (token=identity, lose condition)               | Proposed |
| [0010](0010-sqlite-orm-drizzle.md)                         | SQLite ORM (Drizzle)                                                                  | Proposed |
| [0011](0011-template-database.md)                          | Template Database for Game Instantiation                                              | Proposed |
| [0012](0012-ui-hud-panels-and-resource-tracker.md)         | UI/HUD Panels, Resource Tracker, Action Console                                       | Proposed |
| [0013](0013-terrain-and-elevation.md)                      | Terrain & Elevation System (SRTM, transport constraints)                              | Proposed |
| [0014](0014-power-generation-and-transmission.md)          | Power Generation & Transmission System                                                | Proposed |
| [0015](0015-humanity-and-environmental-impact.md)          | Humanity & Environmental Impact System                                                | Proposed |
| [0016](0016-space-based-resource-gathering.md)             | Space-Based Resource Gathering                                                        | Proposed |
| [0017](0017-code-organization-and-domain-driven-design.md) | Code Organization & Domain-Driven Design (PascalCase, feature folders)                | Superseded |
| [0018](0018-technology-tree-and-recipe-system.md)          | Technology Tree & Recipe System (recipes, tech progression, multi-component crafting) | Proposed |
| [0019](0019-mcp-response-management-and-search.md)         | MCP Response Management & Search (pagination, search tools, context budget)           | Proposed |
| [0020](0020-game-lifecycle-and-cleanup.md)                 | Game Lifecycle & Cleanup (automatic stale game deletion)                              | Proposed |
| [0021](0021-unit-system-and-scaling.md)                    | Unit System & Scaling (metric units, tonnes, MW, 1 tick = 1 day)                      | Proposed |
| [0022](0022-testing-strategy.md)                           | Testing Strategy (Vitest, unit/integration/simulation/component)                      | Proposed |
| [0023](0023-terraforming-and-world-shaping.md)             | Terraforming & World Shaping (terrain modification, planetary engineering)            | Proposed |
| [0024](0024-deployment-and-containerization.md)            | Deployment & Containerization (Docker, docker compose, GitLab CI/CD)                  | Proposed |
| [0025](0025-spectating-and-public-token.md)                | Spectating & Public Token (read-only shareable watch link)                            | Proposed |
| [0026](0026-frontend-state-management.md)                  | Frontend State Management (Pinia stores, SSE, 3D scene sync)                          | Proposed |
| [0027](0027-server-architecture-ioc-and-design-patterns.md) | Server Architecture — IoC, DI & Design Patterns (container, services, repositories) | Proposed |

## ADR Relationships

```
0001 (Architecture) ──┬── 0002 (Earth Viz) ── 0008 (Facility Visuals/Particles)
                      ├── 0004 (MCP Server) ── 0009 (Identity/Token/Lose)
                      │                ├── 0019 (Response/Search)
                      │                └── 0020 (Cleanup)
                      ├── 0005 (SQLite DBs) ──┬── 0010 (Drizzle ORM)
                      │                       ├── 0011 (Template DB) ── 0003 (Resources)
                      │                       │                          ├── 0013 (Terrain) ── 0023 (Terraforming)
                      │                       │                          ├── 0015 (Humanity/Env)
                      │                       │                          └── 0021 (Unit System)
                      │                       └── 0020 (Cleanup)
                       ├── 0006 (Game Loop) ──┬── 0007 (Facilities/Supply Chain)
                       │                      │    ├── 0013 (Terrain) ── 0023 (Terraforming)
                       │                      │    ├── 0014 (Power System)
                       │                      │    ├── 0016 (Space Gathering)
                       │                      │    └── 0018 (Tech Tree/Recipes) ── 0023 (Terraforming)
                       │                      ├── 0009 (Lose Condition) ── 0025 (Spectating)
                       │                      └── 0015 (Humanity/Env) ── 0023 (Terraforming)
                       ├── 0012 (UI/HUD) ──┬── 0004 (MCP)
                       │                   ├── 0015 (Humanity/Env)
                       │                   ├── 0018 (Tech Tree)
                       │                   ├── 0025 (Spectating)
                       │                   └── 0026 (Frontend State)
                       ├── 0014 (Power) ── 0016 (Space)
                        ├── 0017 (Code Org/DDD) ── applies to all ── 0022 (Testing)
                        ├── 0027 (Server IoC/DI) ── supersedes 0017 ── 0001, 0004, 0005, 0006, 0019, 0022
                       ├── 0018 (Tech Tree/Recipes) ── 0003, 0004, 0007, 0011, 0012, 0021, 0023
                       ├── 0023 (Terraforming) ── 0002, 0004, 0007, 0008, 0011, 0013, 0015, 0018
                       ├── 0024 (Deployment) ── 0001, 0005, 0020
                       ├── 0025 (Spectating) ── 0004, 0005, 0009, 0012, 0026
                       └── 0026 (Frontend State) ── 0001, 0002, 0006, 0008, 0012, 0025
```

## Status Legend

- **Proposed** — drafted, pending review/approval
- **Accepted** — approved and will be implemented
- **Deprecated** — superseded by a later ADR
- **Rejected** — considered but not adopted
