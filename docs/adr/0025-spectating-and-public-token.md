# ADR-0025: Spectating & Public Token

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0004, ADR-0005, ADR-0009, ADR-0012 |

## Context

The player watches their LLM agent build an economy on the 3D earth. They may
want to share the view with friends — a read-only spectating mode where friends
can watch the simulation without being able to issue MCP commands or modify
game state. The primary token grants full MCP access (resource tools), so a
separate, read-only access path is needed for spectators.

## Decision

Each game generates a **paired public token** alongside the private MCP token.
The public token grants **read-only web UI access only** — no MCP tool access.
Players share a spectating URL via a clipboard-copy button in the HUD.

### Token Pair

When a game is created, two tokens are generated:

1. **Private token** (existing, ADR-0004): 256-bit random, used as MCP query
   parameter. Grants MCP resource tool access. This is the game owner's token.
2. **Public token** (new): 256-bit random, stored alongside the private token.
   Grants read-only web UI access only — no MCP endpoint access.

Both tokens map to the same game database file (`{private_token}.db`). The
public token is a separate identifier that resolves to the same game.

### Spectating URL

```
https://play.neuralnation.app/watch?token={public_token}
```

- Navigating to this URL loads the full web UI (3D earth, HUD panels, resource
  tracker, event feed, action console, environmental status, tech tree) in
  **read-only mode**.
- Spectators see everything the game owner sees, but:
  - No MCP connection panel / token management.
  - No pause/step/revoke controls.
  - No "New Game" button.
  - A "Spectating" badge replaces the game overview bar's control buttons.
- The spectating URL is shareable — anyone with the link can watch. There is
  no spectator limit in v1.

### Spectating UI in HUD

- A **share icon** (e.g., a holographic chain-link or broadcast symbol) in the
  game overview bar or token management panel.
- Clicking it opens a small popover:

```
┌──────────────────────────────────────┐
│  SHARE SPECTATING LINK               │
│──────────────────────────────────────│
│  Anyone with this link can watch      │
│  your game in real-time (read-only).  │
│                                      │
│  [https://play.neural.../watch?t=...] │
│  [📋 Copy to Clipboard]               │
│                                      │
│  [Regenerate Link] [Close]            │
└──────────────────────────────────────┘
```

- **Copy to clipboard**: Copies the full spectating URL. One-click, no text
  selection needed.
- **Regenerate link**: Generates a new public token, invalidating the old one.
  Useful if the link was shared too widely. Requires confirmation.
- The full URL is displayed in a read-only text field so the player can verify
  what they're copying.

### Public Token in registry.json

The registry entry (ADR-0005) is updated to include the public token:

```json
{
  "token": "AbC123...",
  "publicToken": "XyZ789...",
  "createdAt": "2026-07-08T...",
  "lastActive": "...",
  "status": "Active",
  "cleanupEligibleAt": null
}
```

- The public token is stored in the game DB's `meta` table and in
  `registry.json` for resolution.
- A `publicToken → privateToken` lookup map (in memory or in registry) allows
  the server to resolve a spectating request to the correct game DB.

### Route Handling

- `GET /watch?token={publicToken}`: Validates public token against registry,
  resolves to game, serves the web UI in spectator mode. The web UI receives
  a `spectator: true` flag (via SSR context or client-side check) that hides
  owner-only controls.
- `GET /api/game-state?token={publicToken}`: Read-only game state API for
  spectator-mode UI data fetching. Validates public token, returns same data
  as the private token's web UI queries. No MCP tool access.
- `GET /mcp/sse?token={publicToken}` and `POST /mcp/messages?token={publicToken}`:
  **Rejected**. Public token is not accepted at MCP endpoints. Returns 403.
- SSE event stream (`/api/events?token={publicToken}`): Spectators receive the
  same real-time event stream as the owner, so they see ticks/actions live.

### Security

- Public token is unguessable (256-bit random) — same as private token.
- Public token cannot invoke MCP tools — enforced at the `/mcp/` route level
  (token must match a private token in the registry).
- Spectators cannot pause, step, revoke, mint tokens, or delete the game.
- Regenerating the public token immediately invalidates old spectating links.
- The public token does NOT provide access to the private token or MCP URL —
  spectators cannot "upgrade" to control access.

### Spectator Experience

- Spectators see the exact same 3D earth, particle clouds, HUD panels, and
  real-time updates as the owner.
- The "waiting for LLM..." indicator is visible to spectators too — they
  know when the game is idle.
- If the game is over (ADR-0009), spectators see the Game Over overlay with
  summary stats.
- If the game is cleaned up (ADR-0020), the spectating URL returns a "game no
  longer available" message.

## Consequences

**Positive:**
- Players can share their game with friends without risking MCP control.
- Simple token pair model — no separate auth system or user accounts.
- Spectating URL is a single link — no signup or login for spectators.
- Read-only enforcement is clean: public token simply isn't accepted at MCP
  endpoints.

**Negative:**
- Additional token management complexity (pair generation, resolution).
- No spectator revocation per-person — the link is either valid or
  regenerated. If a specific person should lose access, the only option is
  regenerating the link (invalidating it for everyone).
- Unlimited spectators in v1 could be a bandwidth concern if many people
  watch a popular game. Deferred per scalability decision.
- Public token in query string has same logging concern as private token
  (ADR-0004) — must scrub `/watch` route from access logs.

## Alternatives Considered

- **Password-protected spectating**: Adds a password the owner sets and shares.
  More secure per-person but adds UI complexity (password entry for
  spectators). Token-in-URL is simpler for v1.
- **Time-limited spectating links**: Public token includes an expiry. Adds
  complexity for minimal v1 benefit — can add later if needed.
- **Separate spectator accounts**: Contradicts no-accounts principle
  (ADR-0009). Rejected.
- **No spectating**: Rejected — user specifically wants shareable watch links.