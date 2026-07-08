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

### Game Loop: Real-Time Simulation with Tick-Based Processing

The game runs a **server-side simulation tick loop** that processes production,
resource consumption, and transport flows. The player watches results
rendered on the 3D earth in real-time.

- **Tick rate**: Configurable per game (default: 1 tick = 1 second of real time
  = 1 in-game "minute" or similar abstraction).
- **Per-tick processing**: Each tick, the simulation:
  1. Processes facility production (extractors mine, factories transform).
  2. Moves resources along transport links.
  3. Updates stockpile levels.
  4. Depletes resource deposits (extracted quantity reduces deposit quantity).
  5. Logs significant events to `event_log` for UI display.
- **Player-visible updates**: The web UI polls or receives SSE/websocket
  updates of game state changes, rendering new facilities, transport flows,
  and stockpile changes on the globe.

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
- **Pause/resume the simulation** (stops tick processing without disconnecting
  the LLM — the LLM can still query state but production halts).

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
- Server-side tick loop centralizes simulation logic; no client-side
  desync risk.

**Negative:**
- Player has no in-game corrective action if the LLM misbehaves (other than
  revoking the token or messaging via their chat client). This is by design —
  it's a sandbox for observing LLM behavior.
- Tick processing must be efficient; a game with hundreds of facilities and
  transport links per tick must stay within budget (~16ms for 60fps UI updates,
  though the tick itself can be slower if UI updates are decoupled).
- The web UI needs real-time data delivery (SSE or websocket) to feel live
  without excessive polling.

## Alternatives Considered

- **Turn-based**: Player issues commands, LLM executes, then waits. Rejected —
  breaks the "watch it grow" passive appeal; real-time is more engaging for
  observation.
- **In-game chat panel**: Rejected — player specifically wants BYO LLM client;
  duplicating chat in the web UI adds complexity without value.
- **Player can directly build**: Rejected — the entire concept is that the LLM
  is the builder. Giving the player build tools undermines the premise.