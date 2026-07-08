# ADR-0009: Game Identity, Persistence & Win State

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |

## Context

The game has no user accounts. The MCP token is the player's identity — it is
both their game's database name and their LLM's access credential. There is no
win condition; the game is an open-ended sandbox for observing LLM-driven
economic development.

## Decision

### Identity: Token = Game = Identity

- **No accounts, no login, no authentication for the web UI.**
- A game is created by visiting the "New Game" page and clicking create. The
  server generates a token, creates the DB, and returns the MCP URL.
- The token is stored in the player's browser `sessionStorage` so the web UI
  knows which game to display. If the player closes the tab, they must
  re-enter their token (or use the MCP URL) to return to their game.
- The web UI has a "Return to Game" entry point where the player pastes their
  MCP URL or raw token. The server validates the token exists (DB file
  present) and loads the game.

### Persistence

- Game state persists in the SQLite DB on the server indefinitely (until game
  deletion or server wipe).
- The browser has no persistent token storage by default (`sessionStorage`
  clears on tab close). This is intentional — the token is a secret and should
  not persist in browser storage that other scripts could access.
- **Optional**: Player can choose "Remember this game on this device" which
  stores the token in `localStorage` for convenience. This is opt-in, not
  default.

### Game Deletion

- Player can delete a game from the web UI (requires entering the token to
  confirm). This deletes the SQLite DB file and removes the entry from
  `registry.json`.
- Games inactive for a configurable period (e.g., 90 days) may be archived or
  deleted by a server-side cleanup job. Configurable.

### Win State: Open-Ended Sandbox

- **No win condition.** No lose condition. The simulation runs indefinitely.
- Success is self-defined. The player watches the economy grow, admires the
  glowing network, and experiments with different LLM agents and directives.
- **Milestones** (non-binding, display-only): The web UI can show achievement-
  style milestones — "First metal produced", "100 facilities built", "Full
  periodic table extracted", "Synthetic element created". These are cosmetic
  badges in the event feed, not game objectives.

### New Game / Multiple Games

- A player can create as many games as they want (no rate limit in v1; may add
  throttling later).
- Each game is fully independent with its own token and DB.
- The web UI can only display one game at a time (the token in
  `sessionStorage`). Switching games means returning to the "Return to Game"
  screen and entering a different token.

## Consequences

**Positive:**
- Zero-friction onboarding — no signup, no email, no password. Click "New Game"
  and play.
- Token = identity is simple and matches the MCP architecture perfectly.
- Open-ended sandbox means no content pressure — the LLM and player create
  the experience.
- Server-side persistence means games survive browser restarts; only the
  token must be remembered by the player.

**Negative:**
- Token loss = game loss. If a player doesn't save their MCP URL and closes
  the tab, the game is irrecoverable without the token. Mitigated by "Remember
  on this device" option and the fact that the player also has it in their MCP
  client config.
- No cross-game features (leaderboards, sharing) without accounts. Acceptable
  for v1.
- No rate limiting on game creation could lead to DB file proliferation. Add
  throttling if abuse occurs.

## Alternatives Considered

- **User accounts + multiple games**: Adds auth complexity (passwords, email
  verification, session management) for limited v1 value. Can be layered on
  later by associating tokens with user accounts.
- **Token-based return with no optional persistence**: Simpler but worse UX —
  every tab close forces re-entry. The opt-in `localStorage` option is a good
  compromise.
- **Goal-based milestones**: Rejected as mandatory; the open-ended sandbox is
  the core appeal. Cosmetic milestones are fine as non-binding flavor.