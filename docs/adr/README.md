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
| [0008](0008-visual-representation-of-facilities.md) | Visual Representation of Facilities (glowing geometric primitives) | Proposed |
| [0009](0009-game-identity-persistence-win-state.md) | Game Identity, Persistence & Win State (token=identity, sandbox) | Proposed |
| [0010](0010-sqlite-orm-drizzle.md) | SQLite ORM (Drizzle) | Proposed |
| [0011](0011-template-database.md) | Template Database for Game Instantiation | Proposed |
| [0012](0012-ui-hud-panels-and-resource-tracker.md) | UI/HUD Panels and Resource Tracker | Proposed |

## ADR Relationships

```
0001 (Architecture) ──┬── 0002 (Earth Viz)
                     ├── 0004 (MCP Server) ── 0009 (Identity/Token)
                     ├── 0005 (SQLite DBs) ──┬── 0010 (Drizzle ORM)
                     │                       └── 0011 (Template DB) ── 0003 (Resources)
                     ├── 0006 (Game Loop) ─── 0007 (Facilities/Supply Chain)
                     └── 0008 (Facility Visuals)
```

## Status Legend

- **Proposed** — drafted, pending review/approval
- **Accepted** — approved and will be implemented
- **Deprecated** — superseded by a later ADR
- **Rejected** — considered but not adopted