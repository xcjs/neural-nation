# ADR-0006: Game Loop & Player Interaction

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |

## Context

The player is a passive overseer — they watch the LLM autonomously build and
manage an economy on the 3D earth. The player does not directly build or
control facilities. Instead, they interact with the LLM through their own MCP
client chat interface, issuing directives that the LLM may or may not follow.

## Decision

### Game Loop: Event-Driven Tick (MCP-Triggered Advancement)

The simulation does **not** run on a wall-clock timer. Instead, the game only
advances when the LLM makes an MCP call. This ensures the game doesn't progress
too rapidly when the LLM/user is idle — the simulation pauses naturally when
nothing is happening and advances in discrete steps as the LLM acts.

- **Tick trigger**: Each MCP tool invocation from the LLM advances the
  simulation by one or more ticks before returning the tool result. The tool
  response includes the resulting game state, so the LLM sees the effects of
  its action immediately.
- **Ticks per MCP call**: Configurable per game (default: 1 tick per call).
  Complex actions or time-scaled actions may advance multiple ticks.
- **Idle behavior**: When no MCP calls are received, the game is frozen in
  time — no production, no depletion, no transport. The earth view shows the
  last known state. This is by design: the game progresses at the pace of LLM
  decision-making.
- **Per-tick processing**: Each tick, the simulation:
  1. Processes facility production (extractors mine, factories transform).
  2. Moves resources along transport links.
  3. Updates facility buffers and stockpile levels.
  4. Depletes resource deposits (extracted quantity reduces deposit quantity).
  5. Logs significant events to `event_log` for UI display.
- **Player-visible updates**: The web UI receives SSE/websocket updates when
  ticks are processed (i.e., when the LLM acts). Between LLM actions, the UI
  shows a static state. A "waiting for LLM..." indicator communicates when the
  game is idle.
- **Manual "advance" (optional)**: The web UI may offer a "step forward" button
  that triggers a tick without an LLM action, for players who want to nudge
  the simulation. This is a convenience, not the primary loop.

### Player Role: Passive Overseer

The player does NOT have any direct game-mechanical actions in the web UI. They
cannot:
- Build facilities
- Place transport links
- Assign production targets
- Move resources

The player CAN from the web UI:
- **Pan/zoom/rotate** the 3D earth.
- **Click facilities/deposits** to inspect their state (read-only info panels).
- **View stockpiles**, production graphs, and event log.
- **Revoke the MCP token** (cuts off LLM access).
- **Mint a new token** (if the old one was lost/compromised).
- **Pause the simulation** (blocks tick advancement even on MCP calls —
  useful for inspecting state. The LLM can still query read-only state but
  build/production tools return a "game paused" error).

### Player-LLM Interaction: Via the Player's Own Chat Client

The player communicates directives to the LLM through their own MCP client
(Claude Desktop, Cursor, etc.) — the same client the LLM uses to access the
MCP server. The player types messages like:

> "Prioritize iron production in the northern hemisphere."
> "Build a steel supply chain — iron mine → smelter → stockpile."
> "Why is water running low? Investigate and fix it."

The LLM reads these directives, decides how to act, and uses the MCP resource
tools to build/survey/adjust. Whether the LLM complies is up to the LLM's
reasoning — directives are advisory, not commands.

**The web UI does not include a chat interface.** All player-LLM communication
happides in the player's chosen MCP client. The web UI is purely an observation
deck for the simulation.

### What the Player Sees

- **3D earth**: Facilities as glowing markers, transport links as glowing arcs
  (ADR-0002, ADR-0008). Pulse animations show active production and resource
  flow.
- **HUD overlays**: Total production summary, resource stockpile levels,
  facility count, transport count.
- **Event feed**: Chronological log of LLM actions ("Built iron mine at
  35.2°N, 139.7°E", "Transport link established: mine → smelter", "Iron
  stockpile reached 1000 units").
- **Detail panels**: Click any facility/transport/deposit to see its stats,
  inputs/outputs, and history.

## Consequences

**Positive:**
- Clean separation: web UI = observation, MCP client = interaction. No
  duplicated chat infrastructure.
- The "passive overseer" loop is inherently satisfying — watching autonomous
  agents build is the core appeal.
- Event-driven ticks mean no wasted computation when idle; the server only
  works when the LLM acts.
- The game naturally paces itself to the LLM's decision speed — no need for
  a separate tick scheduler or timer infrastructure.
- Tool responses include post-tick state, giving the LLM immediate feedback
  on its actions.

**Negative:**
- Player has no in-game corrective action if the LLM misbehaves (other than
  revoking the token or messaging via their chat client). This is by design —
  it's a sandbox for observing LLM behavior.
- Tick processing must be efficient; a game with hundreds of facilities and
  transport links per tick must complete within the MCP call's response time
  (target <500ms including DB writes) to avoid LLM timeouts.
- The web UI needs real-time data delivery (SSE or websocket) to reflect
  tick results promptly; between MCP calls the UI is static, which may feel
  "dead" to some players (mitigated by the "waiting for LLM..." indicator).
- If the LLM makes rapid successive calls, ticks may pile up; the server
  should batch or queue ticks if calls arrive faster than processing time.

## Alternatives Considered

- **Wall-clock real-time ticks**: Rejected — game would progress too rapidly
  when the LLM/user is idle, and would waste server resources simulating
  with no observer. Event-driven ticks solve both problems.
- **Turn-based (player issues commands, LLM executes, then waits)**:
  Rejected — the event-driven model is more natural: the LLM acts when it
  decides to, and the game advances in response. No explicit "end turn"
  needed.
- **In-game chat panel**: Rejected — player specifically wants BYO LLM client;
  duplicating chat in the web UI adds complexity without value.
- **Player can directly build**: Rejected — the entire concept is that the LLM
  is the builder. Giving the player build tools undermines the premise.