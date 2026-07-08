# Neural Nation — Architecture Decision Records

ADR index for the Neural Nation project. Each ADR documents a key architectural
decision, its context, and consequences.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-project-architecture.md) | Project Architecture (Nuxt/Vue/TS/TresJS/Nitro) | Proposed |
| [0002](0002-earth-visualization.md) | 3D Earth Visualization (TresJS, wireframe/holographic) | Proposed |
| [0003](0003-resource-distribution.md) | Resource Distribution Model (real geological data, periodic table) | Proposed |
| [0004](0004-mcp-server-architecture.md) | MCP Server Architecture (HTTP/SSE, token-scoped, resource tools) | Proposed |
| [0005](0005-per-game-sqlite-databases.md) | Per-Game SQLite Databases (token-named, Nitro-hosted) | Proposed |
| [0006](0006-game-loop-and-player-interaction.md) | Game Loop & Player Interaction (passive overseer, BYO LLM client) | Proposed |
| [0007](0007-facility-and-supply-chain.md) | Facility & Supply Chain System (full chain, explicit transport) | Proposed |
| [0008](0008-visual-representation-of-facilities.md) | Visual Representation of Facilities (glowing primitives + particle clouds) | Proposed |
| [0009](0009-game-identity-persistence-win-state.md) | Game Identity, Persistence & Win State (token=identity, lose condition) | Proposed |
| [0010](0010-sqlite-orm-drizzle.md) | SQLite ORM (Drizzle) | Proposed |
| [0011](0011-template-database.md) | Template Database for Game Instantiation | Proposed |
| [0012](0012-ui-hud-panels-and-resource-tracker.md) | UI/HUD Panels, Resource Tracker, Action Console | Proposed |
| [0013](0013-terrain-and-elevation.md) | Terrain & Elevation System (SRTM, transport constraints) | Proposed |
| [0014](0014-power-generation-and-transmission.md) | Power Generation & Transmission System | Proposed |
| [0015](0015-humanity-and-environmental-impact.md) | Humanity & Environmental Impact System | Proposed |
| [0016](0016-space-based-resource-gathering.md) | Space-Based Resource Gathering | Proposed |
| [0017](0017-code-organization-and-domain-driven-design.md) | Code Organization & Domain-Driven Design (PascalCase, feature folders) | Proposed |
| [0018](0018-technology-tree-and-recipe-system.md) | Technology Tree & Recipe System (recipes, tech progression, multi-component crafting) | Proposed |

## ADR Relationships

```
0001 (Architecture) ──┬── 0002 (Earth Viz) ── 0008 (Facility Visuals/Particles)
                      ├── 0004 (MCP Server) ── 0009 (Identity/Token/Lose)
                      ├── 0005 (SQLite DBs) ──┬── 0010 (Drizzle ORM)
                      │                       └── 0011 (Template DB) ── 0003 (Resources)
                      │                                  ├── 0013 (Terrain)
                      │                                  └── 0015 (Humanity/Env)
                      ├── 0006 (Game Loop) ──┬── 0007 (Facilities/Supply Chain)
                      │                      │    ├── 0013 (Terrain)
                      │                      │    ├── 0014 (Power System)
                      │                      │    └── 0016 (Space Gathering)
                      │                      ├── 0009 (Lose Condition)
                      │                      └── 0015 (Humanity/Env)
                      ├── 0012 (UI/HUD) ──┬── 0004 (MCP)
                      │                   └── 0015 (Humanity/Env)
                      ├── 0014 (Power) ── 0016 (Space)
                      ├── 0017 (Code Org/DDD) ── applies to all
                      └── 0018 (Tech Tree/Recipes) ── 0003, 0004, 0007, 0011, 0012
```

## Status Legend

- **Proposed** — drafted, pending review/approval
- **Accepted** — approved and will be implemented
- **Deprecated** — superseded by a later ADR
- **Rejected** — considered but not adopted