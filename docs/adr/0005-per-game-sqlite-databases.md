# ADR-0005: Per-Game SQLite Databases

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0010, ADR-0011, ADR-0020, ADR-0025 |

## Context

Each game is independent with its own simulation state, resource deposits,
facilities, and transport networks. The MCP token uniquely identifies a game.
We need a storage model where each game's data is fully isolated and the
database file name directly maps to the token.

## Decision

Use **one SQLite database file per game**, named `{token}.db`, stored in
`data/games/` on the server filesystem. Managed via `better-sqlite3`.

### File Layout

```
data/
  games/
    {token1}.db      ← Game 1's complete state
    {token2}.db      ← Game 2's complete state
    ...
    registry.json    ← Index of active games (token, created_at, last_active)
```

### Database Connection Management

- A `GameDatabase` class wraps each SQLite file with a `better-sqlite3`
  connection, exposed via **Drizzle ORM** (ADR-0010) for type-safe queries.
- Connections are lazy-opened on first access (web UI or MCP) and cached in a
  `Map<token, GameDatabase>` in memory.
- `WAL mode` enabled on each connection for concurrent read/write (web UI reads
  while simulation ticks write).
- Idle connections are closed after a configurable timeout (e.g., 5 minutes of
  no activity) to free file handles.
- A `closeAll()` hook on Nitro shutdown cleanly closes all open DB handles.

### Game Registry

`data/games/registry.json` tracks all active games for the server-side game
list (used by the "return to game" screen):

```json
[
  { "token": "AbC123...", "publicToken": "XyZ789...",
    "createdAt": "2026-07-08T...", "lastActive": "...",
    "status": "Active", "cleanupEligibleAt": null }
]
```

This file is the only place tokens are listed in plaintext outside the DB
files themselves. It is NOT served to the client — the web UI uses the token
the player enters/has in session storage to look up their game. The
`status` and `cleanupEligibleAt` fields support automatic cleanup (ADR-0020).
The `publicToken` field (ADR-0025) is a paired read-only token for spectating;
it resolves to the same game DB but is rejected at MCP endpoints.

### Schema Initialization

When a new game is created:

1. Generate 256-bit random token.
2. **Copy the template database** `data/games/_template.db` to
   `data/games/{token}.db` (ADR-0011). This brings in the full schema and all
   pre-seeded resource deposits in a single file copy — no per-game seeding
   needed.
3. Open `{token}.db` with Drizzle and run any pending migrations (if the
   template is behind the current schema version).
4. Insert `meta` row with token, creation timestamp, and game parameters.
5. Add to `registry.json`.
6. Return the full MCP URL to the player (ADR-0004).

### Schema Overview (per-game DB)

Core tables:

- `meta` — game metadata (token, created_at, tick_rate, last_tick_at, last_active_at for cleanup per ADR-0020)
- `resources` — natural resource deposits (see ADR-0003 schema)
- `facilities` — built structures (see ADR-0007)
- `facility_inputs` — resource input requirements per facility
- `facility_outputs` — resource outputs / production state per facility
- `transports` — transport links between facilities (see ADR-0007)
- `transport_flows` — resource flow assignments on transport links
- `stockpiles` — current inventory of each resource (global or per-facility)
- `survey_log` — record of LLM survey operations
- `event_log` — append-only log of significant game events for UI replay

### Migration Strategy

- Migrations managed by **Drizzle Kit** (ADR-0010) — generated from schema
  changes in `server/db/schema/`.
- A `schema_version` table tracks applied migrations.
- Migrations run on template build and on new-game copy (if template is behind
  current schema).

## Consequences

**Positive:**
- Perfect isolation between games — no risk of cross-game data leakage.
- File-per-game maps cleanly to token-per-game; trivially auditable.
- `better-sqlite3` synchronous API is ergonomic in Nitro server routes.
- WAL mode allows concurrent reads (UI) and writes (simulation) without
  blocking.
- Deleting a game = deleting a file. No complex cleanup. Automatic cleanup
  of stale games handled by ADR-0020.

**Negative:**
- Many open file handles if many concurrent games; mitigated by idle
  connection closing.
- No cross-game queries (e.g., global leaderboards) without a separate meta-DB.
- File-based storage means server must have persistent filesystem access (no
  ephemeral container deployments without mounted volumes).

## Alternatives Considered

- **Single SQLite DB with game_id column**: Simpler connection management but
  loses the token=filename elegance and complicates game deletion/cleanup.
- **PostgreSQL with per-game schemas**: Overkill; adds a database server
  dependency and deployment complexity.
- **In-memory game state with periodic SQLite snapshots**: Riskier —
  potential data loss on crash; SQLite is fast enough for direct read/write.