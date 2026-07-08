# ADR-0004: MCP Server Architecture

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0003, ADR-0007, ADR-0009, ADR-0012, ADR-0018, ADR-0019, ADR-0021, ADR-0023 |

## Context

The LLM agent connects to the game via the Model Context Protocol (MCP). Each
game has a unique token that scopes the LLM's access to exactly that game's
database. Players use their own LLM client (Claude Desktop, Cursor, etc.) and
connect by configuring the MCP server URL with their token.

## Decision

Implement an **HTTP/SSE transport MCP server** within the Nuxt/Nitro process,
scoped per-game by a **token passed as a query parameter** in the MCP URL.
The token grants access to **resource tools only** (building, extraction,
transport, surveying) — game state queries are read-only.

### Transport

- **Protocol**: MCP over HTTP with Server-Sent Events (SSE) for server-to-client
  streaming, following the MCP HTTP transport specification.
- **Endpoint**: `GET /mcp/sse?token={token}` — SSE stream for server messages.
- **Endpoint**: `POST /mcp/messages?token={token}` — client-to-server JSON-RPC.
- **Authentication**: Token in query string acts as the sole credential. No
  additional auth headers required. Token is unguessable (256-bit random).

### Token Delivery to Player

When a game is created, the server returns a **full MCP URL** the player can
copy and paste directly into their LLM client configuration:

```
https://play.neuralnation.app/mcp/sse?token=AbC123...xYz
```

The game creation screen displays this URL in a read-only text field with a
**copy-to-clipboard button**. The URL is the only thing the player needs —
the token is embedded in it. Players do not handle the raw token separately.

Example Claude Desktop config snippet (also shown on the creation screen):

```json
{
  "mcpServers": {
    "neural-nation": {
      "url": "https://play.neuralnation.app/mcp/sse?token=AbC123...xYz"
    }
  }
}
```

### Token Lifecycle

1. **Creation**: When a player creates a new game, the server generates a
   256-bit random token (base62-encoded, ~43 chars). This token becomes the
   SQLite database filename (`data/games/{token}.db`) and the MCP query
   parameter value.
2. **Display**: Full MCP URL shown on the game creation screen with
   copy-to-clipboard button and pre-filled MCP client config snippet.
3. **Persistence**: Token stored in the game DB's `meta` table and in a
   server-side game registry (`data/games/registry.json` or a meta-DB) for
   listing active games.
4. **Revocation**: Player can revoke a token from the web UI, immediately
   cutting off LLM access. A new token can be minted for the same game if
   desired (replaces old token, renames DB file, generates new MCP URL).

### Tool Scope (Resource Tools Only)

The MCP server exposes these tools to the LLM:

**Exploration:**
- `survey_region` — survey a lat/lon region for resource deposits (discovers
  nearby undiscovered deposits).
- `get_discovered_resources` — list all discovered deposits in the game.

**Construction:**
- `build_facility` — place a facility at lat/lon with a specified type.
- `demolish_facility` — remove a facility.
- `list_facilities` — list all facilities (read-only).
- `get_facility_details` — inspect a facility's state, inputs, outputs.

**Transport:**
- `build_transport` — create a transport link between two facilities.
- `demolish_transport` — remove a transport link.
- `list_transports` — list all transport links (read-only).

**Logistics:**
- `set_production_target` — set a facility's active recipe and target output
  rate. The LLM selects which recipe a facility executes from the recipes
  available to that facility type (ADR-0018).
- `assign_route` — assign a resource flow to a transport link.
- `get_supply_chain_status` — read-only overview of production/flow.

**Research & Technology (ADR-0018):**
- `start_research` — begin researching a tech node at a research_lab. Consumes
  the tech's research costs over time. Fails if prerequisites are not met or
  if no research_lab is available.
- `get_tech_tree` — read-only view of the full technology tree: all tech nodes
  with their status (completed, in progress, available, locked), research
  costs, prerequisites, and what they unlock (recipes, facility types).
  Supports pagination (ADR-0019).
- `get_recipes` — list all available recipes (filtered by facility type,
  unlocked status, or output resource). Shows inputs, outputs, craft time,
  and tech requirement for each recipe. Supports pagination (ADR-0019).

**Search (ADR-0019):**
- `search_resources` — search resources by name, element symbol, category, or
  construction dependency. Find what's needed to build a facility, what a
  recipe produces, what a tech requires.
- `search_recipes` — search recipes by output resource, facility type, tech
  requirement, or input resource. Lets the agent plan "I need X — what recipe
  makes it and what does that recipe need?"
- `search_facilities` — search built facilities by type, status, resource
  produced/consumed, or geographic proximity.

**Terraforming (ADR-0023):**
- `terraform` — execute a terraforming operation (flatten, dig_canal,
  level_mountain, raise_land, etc.). Parameters include action type, target
  cell range, and the terraforming facility ID. Returns cost estimate,
  environmental impact forecast, and estimated completion tick. The operation
  consumes resources per tick like a recipe.
- `get_terrain_modifications` — list terrain modifications made in this game
  (paginated per ADR-0019). Shows what the agent has changed and when.
- `get_effective_terrain` — read the effective terrain at a location (base +
  modifications). Useful for planning transport or facility placement after
  terraforming.
- `get_terraform_cost_estimate` — preview the resource cost and environmental
  impact of a terraforming operation before committing. Returns resource
  costs, estimated ticks, environmental deltas, and any incidents that would
  be triggered.

**Game State (read-only):**
- `get_game_state` — high-level game stats (tick count, total production,
  resource stockpiles).
- `get_resource_overview` — full resource tracker: all 118 elements + bulk
  resources with collected / remaining / total for each. Mirrors the data
  shown in the web UI resource tracker panel (ADR-0012). Supports filtering
  by category (element/bulk), discovery status, and depletion status.
- `get_resource_details` — detailed view of a single resource: all deposits
  (discovered and undiscovered), their locations, quantities, grades, and
  which extractor facilities (if any) are working them.
- `get_resource_stockpile` — current stockpile of a specific resource across
  all facility buffers.
- `get_event_log` — recent game events (builds, surveys, production
  milestones, depletions). Supports pagination and filtering by event type.

### What the Token Does NOT Grant

- Game creation/deletion (web UI only).
- Token minting/revocation (web UI only).
- Direct database writes bypassing the game engine's simulation rules.
- Access to other games' data.
- Modification of the simulation tick rate or game parameters.

### MCP Server Implementation

- Use `@modelcontextprotocol/sdk` TypeScript SDK.
- Each token creates a separate MCP server instance bound to that game's DB
  connection.
- Server instances are lazy-initialized on first SSE connection and cached
  in a `Map<token, McpServer>` in memory.
- SSE connection lifecycle: on disconnect, the server instance is kept alive
  (the simulation continues) but the SSE stream is closed. Reconnecting
  resumes the stream.

## Consequences

**Positive:**
- HTTP/SSE works with Claude Desktop, Cursor, and any MCP-compliant client
  without local bridge processes.
- Token-in-query-string is simple for players to configure (just paste the URL).
- Resource-tool-only scope keeps the LLM focused on the building/economy loop.
- Lazy per-game server instances keep memory usage proportional to active games.

**Negative:**
- Token in query string may appear in server logs — must ensure Nitro logs are
  scrubbed or the `/mcp` route is excluded from access logging.
- No per-tool granular permissions in v1 — token grants all resource tools.
  Tiered permissions can be added later without architecture changes.
- SSE connections are stateful; server must handle reconnection and session
  resumption gracefully.

## Alternatives Considered

- **stdio transport**: Requires a local bridge process on the player's
  machine. Rejected — adds friction for BYO LLM client scenario.
- **Both transports**: Unnecessary complexity for v1. stdio can be added
  later if local-dev ergonomics demand it.
- **Tiered token permissions**: Over-engineered for v1; single scope is
  simpler and the player is the only user.