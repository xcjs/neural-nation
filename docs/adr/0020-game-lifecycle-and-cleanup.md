# ADR-0020: Game Lifecycle & Cleanup

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0005, ADR-0006, ADR-0009 |

## Context

Games are stored as individual SQLite files on the server (ADR-0005). There
is no account system (ADR-0009), so games are identified only by token. Over
time, the server accumulates game files from:
- Games the LLM agent lost (resource depletion — ADR-0009).
- Games the player abandoned (stopped interacting, closed tab, lost token).
- Games still actively being played.

Without a cleanup mechanism, game DB files accumulate indefinitely, consuming
disk space and open file handles. The user wants games that are lost or
abandoned for one week or longer to be automatically removed, configurable
via an environment variable.

## Decision

### Automatic Game Cleanup

A **cleanup job** runs periodically to remove games that meet cleanup criteria.
The job is triggered by a Nitro scheduled task (or a cron-like interval timer
within the Nitro process).

### Cleanup Criteria

A game is eligible for cleanup when **both** conditions are met:

1. **Age since last activity** ≥ `GAME_CLEANUP_AGE_DAYS` (default: **7 days**).
   "Last activity" is the timestamp of the most recent MCP tool call or web
   UI page load. Tracked in the `meta` table as `last_active_at`.
2. **Game state is terminal or abandoned**:
   - Game is in "Game Over" state (lost, ADR-0009), OR
   - Game has had no MCP calls and no web UI access for the entire age period
     (abandoned).

Active games (MCP calls or web UI access within the age window) are never
cleaned up, regardless of age.

### Configuration

| Env Variable | Default | Description |
|---|---|---|
| `GAME_CLEANUP_ENABLED` | `true` | Enable/disable automatic cleanup |
| `GAME_CLEANUP_AGE_DAYS` | `7` | Days of inactivity before cleanup |
| `GAME_CLEANUP_INTERVAL_HOURS` | `6` | How often the cleanup job runs |
| `GAME_CLEANUP_GRACE_DAYS` | `1` | Grace period (in days) after a game becomes eligible before deletion (allows recovery if the player returns) |

### Cleanup Process

1. **Scan**: The job iterates `registry.json` entries, checking each game's
   `last_active_at` against the configured age threshold.
2. **Grace period**: If a game becomes eligible, it is marked
   `pending_cleanup` in `registry.json` with a `cleanup_eligible_at`
   timestamp. The game is NOT deleted immediately — the grace period (in
   days, configurable via `GAME_CLEANUP_GRACE_DAYS`) must elapse first.
3. **Deletion**: After the grace period, if the game is still inactive:
   - Close the DB connection if open (remove from the `Map<token, GameDatabase>`).
   - Delete the SQLite file (`data/games/{token}.db`).
   - Remove the `-wal` and `-shm` files if present.
   - Remove the entry from `registry.json`.
   - Log the deletion to the server log.
4. **Recovery**: If the player returns during the grace period (MCP call or
   web UI access), the `pending_cleanup` flag is cleared and the game
   continues normally.

### Tracking Last Activity

The `meta` table in each game DB gets a `last_active_at` column, updated on:

- Every MCP tool invocation (any tool call via the MCP server).
- Every web UI state poll (the `/api/state/[token]` endpoint hit).
- Every web UI SSE connection open.

This timestamp is the sole determinant of "activity" — not whether the game
is paused, running, or in any particular state.

### Interaction with Game Over

Games in "Game Over" state (ADR-0009) are frozen — no ticks advance, MCP
build tools return errors. But read-only MCP queries still work, and the
web UI can still display the final state. The cleanup job treats Game Over
games the same as abandoned games for age purposes: if no one has queried
or viewed the game for the age period, it's eligible for cleanup.

The Game Over overlay in the web UI (ADR-0009) informs the player that the
game will be cleaned up after N days of inactivity, with the exact date.

### Manual Deletion

The player can still manually delete a game at any time from the web UI
(ADR-0009). Manual deletion bypasses the grace period — the game is
deleted immediately after token confirmation.

### Registry Update

`registry.json` gains two new fields per game:

```json
{
  "token": "AbC123...",
  "createdAt": "2026-07-08T...",
  "lastActive": "2026-07-15T...",
  "status": "Active",           // "Active" | "GameOver" | "PendingCleanup"
  "cleanupEligibleAt": null      // ISO timestamp when grace period ends, or null
}
```

### Implementation Location

The cleanup job lives in `server/domain/game/cleanup.service.ts` (ADR-0017).
It is triggered by a Nitro scheduled task registered in a server plugin
(`server/plugins/cleanup.ts`). The job reads `registry.json`, checks
eligibility, and performs deletion.

## Consequences

**Positive:**
- Disk usage is bounded — old games are automatically reclaimed.
- Configurable age threshold lets operators tune cleanup aggressiveness.
- Grace period prevents accidental loss if a player takes a short break.
- Games in Game Over state don't linger forever consuming resources.
- Last-activity tracking is simple and unambiguous.

**Negative:**
- Players who lose their token and try to return after the cleanup window
  will find their game gone. Mitigated by the grace period and the Game Over
  overlay warning.
- The cleanup job adds a small periodic I/O cost (scanning `registry.json`).
- If `registry.json` becomes corrupt, cleanup could miss games or delete
  the wrong ones. Mitigated by keeping `registry.json` small and atomic-write
  on updates.

## Alternatives Considered

- **No automatic cleanup**: Rejected — the user explicitly wants stale games
  removed. Without cleanup, disk grows unbounded.
- **Archive instead of delete**: Could zip and move old games to
  `data/games/archived/`. Rejected for v1 — adds complexity with no clear
  benefit since there are no accounts to recover from. Can be added later.
- **Cleanup on access (lazy)**: Only check for cleanup when a game is
  accessed. Rejected — abandoned games that are never accessed again would
  never be cleaned up.
- **Separate cron process**: Rejected — keeping it in the Nitro process
  avoids a deployment dependency and is simpler for single-process hosting.