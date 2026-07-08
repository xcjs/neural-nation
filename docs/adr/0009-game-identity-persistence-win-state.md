# ADR-0009: Game Identity, Persistence & Win State

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0003, ADR-0006, ADR-0015, ADR-0016, ADR-0020 |

## Context

The game has no user accounts. The MCP token is the player's identity — it is
both their game's database name and their LLM's access credential. The game
is an open-ended sandbox for observing LLM-driven economic development, but
with a **lose condition**: if the LLM agent runs out of resources, the game
ends. This creates stakes and forces the LLM to plan ahead rather than
endlessly consuming finite deposits.

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
- **Automatic cleanup** (ADR-0020): Games that are lost or abandoned (no
  MCP calls or web UI access) for a configurable period (default 7 days, via
  `GAME_CLEANUP_AGE_DAYS` env var) are automatically deleted after a grace
  period (default 1 day, via `GAME_CLEANUP_GRACE_DAYS`). The Game Over
  overlay warns the player of the cleanup date. Active games are never
  cleaned up regardless of age.

### Win State: Open-Ended Sandbox with Lose Condition

- **No win condition.** The simulation runs indefinitely — success is
  self-defined. The player watches the economy grow, admires the glowing
  network, and experiments with different LLM agents and directives.
- **Lose condition: Resource depletion.** If the LLM agent runs out of
  resources (no remaining extractable resources, no stockpiles, no
  production capacity), the game ends. This forces the LLM to manage
  finite resources wisely and plan for sustainability — or build space
  infrastructure (ADR-0016) to gather resources from space before Earth
  runs out.
  - "Out of resources" means: all non-renewable deposits depleted, all
    stockpiles empty, and no active production generating new resources.
    Renewable resources alone (wood, water, biomass) may sustain a small
    economy but cannot fuel advanced industry without elements and
    non-renewables.
  - The web UI shows a warning when resource levels are critically low
    (e.g., \u003c10% of starting resources remaining across all categories).
  - When the lose condition triggers, the game enters a "Game Over" state:
    no further ticks advance, the earth view shows the final state, and the
    event feed displays a summary (total ticks, peak facility count, peak
    resource diversity, etc.). The player can start a new game or delete the
    ended game.
  - **Soft lose condition (optional, configurable): Population collapse.**
    If population reaches zero (ADR-0015 — civilization collapsed), the game
    may optionally end. This is configurable: the player can enable/disable
    it at game creation. If disabled, population reaching zero is a serious
    warning but not game-ending (the LLM can try to recover via space
    habitats, ADR-0016). If enabled, population = 0 = game over.
- **Milestones** (non-binding, display-only): The web UI can show achievement-
  style milestones — "First metal produced", "100 facilities built", "Full
  periodic table extracted", "Synthetic element created", "Space station
  operational", "First asteroid mined". These are cosmetic badges in the
  event feed, not game objectives.

### Starting Resources

- **New games start with randomized resources** within reasonable parameters.
  The LLM agent begins with a starter stockpile of materials and energy to
  bootstrap its economy (build first extractors, power plants, transport).
- Randomization is bounded so games are challenging but not impossible:
  - Starting energy/fuel: enough to build 2-3 basic facilities + power plant
  - Starting construction materials (steel, concrete): enough for initial
    builds, not enough to skip early game
  - Starting food/population: a small population base (population is also a
    renewable resource per ADR-0003, so it grows from this starting point)
  - Randomization range is configurable (difficulty preset: easy/normal/hard
    affects starting quantities)
- Starting resources are NOT placed as deposits — they're a stockpile the
  agent begins with. The agent must survey and build extractors to access
  the earth's actual deposits (which are much larger but require
  infrastructure to access).
- If the agent exhausts its starting stockpile before establishing production,
  the lose condition triggers. This creates early-game pressure: the agent
  must be efficient with its starter resources to bootstrap before they run
  out.

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
- Open-ended sandbox with a lose condition creates stakes without adding
  content pressure — the LLM and player create the experience, but resource
  depletion forces meaningful planning.
- Space gathering (ADR-0016) provides a long-term answer to depletion, giving
  skilled LLM agents a path to sustainability.
- Starting resources with randomization adds replay variety — each game has
  different initial conditions.
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
- Lose condition means games have finite length — some players may prefer
  pure sandbox. Mitigated by the fact that resource depletion takes a long
  time, and space gathering effectively removes the lose condition for
  advanced agents.
- Starting resource randomization could occasionally create unwinnable
  starting positions (too few resources to bootstrap). Bounded
  randomization + difficulty presets mitigate this.

## Alternatives Considered

- **User accounts + multiple games**: Adds auth complexity (passwords, email
  verification, session management) for limited v1 value. Can be layered on
  later by associating tokens with user accounts.
- **Token-based return with no optional persistence**: Simpler but worse UX —
  every tab close forces re-entry. The opt-in `localStorage` option is a good
  compromise.
- **Goal-based milestones**: Rejected as mandatory; the open-ended sandbox is
  the core appeal. Cosmetic milestones are fine as non-binding flavor.
- **No lose condition (pure sandbox)**: Rejected — the user specifically wants
  resource depletion as a lose condition to create stakes. Without it, the
  LLM has no pressure to be efficient or plan ahead.
- **Win condition (not just lose)**: Rejected — a specific win goal would
  constrain the open-ended nature. The lose condition creates enough
  pressure; the player defines "winning" as whatever they find satisfying
  (sustainability, space expansion, full periodic table, etc.).
- **Fixed starting resources (no randomization)**: Rejected — randomization
  adds replay value and prevents the LLM from memorizing an optimal opening
  build order. Bounded randomization keeps games fair.