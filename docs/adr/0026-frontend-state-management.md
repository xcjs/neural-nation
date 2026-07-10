# ADR-0026: Frontend State Management

| Field      | Value                                                      |
| ---------- | ---------------------------------------------------------- |
| Status     | Proposed                                                   |
| Date       | 2026-07-08                                                 |
| Deciders   | Project owner                                              |
| Relates to | ADR-0001, ADR-0002, ADR-0006, ADR-0008, ADR-0012, ADR-0025 |

## Context

ADR-0001 chose Pinia for client-side state management, but the details of how
the frontend consumes the real-time SSE event stream, caches game state, syncs
with the 3D scene, and handles reconnection were not specified. This is
non-trivial: the UI must render a 3D earth with hundreds of instanced markers,
particle systems, transport arcs, multiple HUD panels (resource tracker with
130+ rows, event feed, action console, tech tree, environmental status), and
receive incremental updates in bursts when the LLM is active.

## Decision

Use **Pinia stores** as the single source of truth for client-side game state,
fed by a **dedicated SSE connection manager** composable. The 3D scene
reactively subscribes to store state via TresJS's reactivity system.

### Store Architecture

```
stores/
  game.ts          — core game state (tick, status, overview stats)
  resources.ts     — resource tracker data (130+ rows, categories)
  facilities.ts    — facility list + selected facility detail
  transports.ts    — transport links + flows
  events.ts        — event log (paginated, server-side fetch)
  actions.ts       — action console (paginated, server-side fetch)
  techtree.ts       — tech tree state (nodes, research progress)
  environment.ts   — environmental metrics + overlays toggle
  terrain.ts        — terrain modifications (paginated)
  power.ts         — power grid status (topology, capacity)
  space.ts         — space infrastructure status
  ui.ts            — UI state (panel visibility, selected entity, spectator mode)
```

Each store follows a consistent pattern:

- `state`: reactive data for its domain
- `actions`: methods to fetch data from server API (initial load + pagination)
- `applyUpdate(patch)`: apply an incremental SSE update to the store
- `reset()`: clear state on game switch

### SSE Connection Manager

A composable (`composables/useGameSSE.ts`) manages the SSE connection:

- **Endpoint**: `GET /api/events?token={privateToken}` (or public token for
  spectators, ADR-0025).
- **Connection lifecycle**: auto-connect on game load, auto-reconnect with
  exponential backoff (1s, 2s, 4s, 8s, max 30s) on disconnect.
- **Message types**: the server sends typed event messages:

```typescript
type SSEEvent =
  | { type: 'tick', tick: number, changes: TickChanges }
  | { type: 'facility_built', facility: FacilitySnapshot }
  | { type: 'facility_updated', facilityId: number, changes: Partial<Facility> }
  | { type: 'facility_demolished', facilityId: number }
  | { type: 'transport_built', transport: TransportSnapshot }
  | { type: 'transport_demolished', transportId: number }
  | { type: 'resource_updated', resourceId: string, changes: ResourceDelta }
  | { type: 'event_logged', event: GameEvent }
  | { type: 'action_logged', action: ActionSnapshot }
  | { type: 'research_updated', techNodeId: string, progress: number }
  | { type: 'environment_updated', metrics: EnvironmentalMetrics }
  | { type: 'terrain_modified', modification: TerrainModification }
  | { type: 'game_over', summary: GameOverSummary }
  | { type: 'full_state', state: FullGameState } // sent on reconnect
```

- **Dispatch**: the composable dispatches each SSE event to the relevant Pinia
  store's `applyUpdate()` method. No store fetches from the server on SSE
  events — the event payload IS the update.
- **Reconnect → full sync**: on reconnect, the server sends a `full_state`
  event with a complete snapshot. Stores replace their state with this
  snapshot. This handles any events missed during disconnection.
- **Backpressure**: if the UI can't keep up with event rate (e.g., rapid LLM
  calls), the SSE manager buffers events and applies them in request animation
  frame batches to avoid blocking the main thread.

### 3D Scene Sync

The TresJS scene subscribes to Pinia stores for its rendering data:

- **Facility markers**: `facilities` store → instanced mesh positions, types,
  activity levels (for particle cloud density).
- **Particle clouds**: `facilities` store → per-facility throughput drives
  particle shader uniforms (ADR-0008). Particle system reads store state on
  each animation frame via a `useRenderLoop` composable.
- **Transport arcs**: `transports` store → arc geometries + flow particle
  rates.
- **Terrain mesh**: `terrain` store → vertex displacement from effective
  elevation (base + modifications, ADR-0013/0023). Terrain modifications
  trigger vertex lerp animations.
- **Environmental overlays**: `environment` store → pollution heatmap opacity,
  biome degradation colors (toggled via store).
- **Selection**: clicking a marker dispatches to `ui` store (`selectFacility`),
  which the facility detail panel watches. The marker's highlight state is
  derived from `ui.selectedFacilityId`.

The 3D scene does NOT own game state — it reads from stores. The only state
the scene owns is camera position/rotation and rendering-only parameters (LOD
level, quality settings).

### Initial Load

On game load (private or public token):

1. Fetch full game state: `GET /api/game-state?token={token}` → populate all
   stores with current snapshot.
2. Fetch paginated data (events, actions, terrain mods) for initial pages.
3. Open SSE connection → start receiving incremental updates.
4. Stores are now "live" — SSE events keep them current, API calls are only
   for paginated history (older events, action console pages).

### Pagination for History

Event feed, action console, and terrain modifications use **server-side
pagination** (ADR-0019). Stores fetch pages on demand:

- `events.fetchPage(offset, limit)` → appends to events list.
- `actions.fetchPage(offset, limit, filter)` → replaces action console list.
- Infinite scroll or explicit pagination controls in the UI trigger these
  fetches.

The stores maintain only the currently-visible pages in memory. SSE events
that arrive while viewing page N update the "live" tail; scrolling to older
pages fetches from the server.

### UI State Store

The `ui` store handles non-game state:

- `selectedFacilityId`, `selectedTransportId`, `selectedResourceKey` —
  currently inspected entity.
- `panelVisibility: { resourceTracker, eventFeed, actionConsole, techTree,
environmentalStatus, facilityDetail }` — which panels are open.
- `spectatorMode: boolean` — true if viewing via public token (ADR-0025).
  Hides owner-only controls.
- `isMobile: boolean` — detected on load, drives mobile warning overlay
  (ADR-0009 update).
- `quality: 'low' | 'medium' | 'high'` — rendering quality, adjustable via
  settings (affects particle counts, LOD distances, bloom intensity).

### Reconnection UX

- Connection status indicator in the HUD (connected / reconnecting / offline).
- When reconnecting: panels show stale data with a subtle "stale" indicator
  (dimmed, timestamp frozen).
- On reconnect: brief flash as full_state replaces stale data. Smooth —
  stores update reactively, panels re-render.
- If reconnection fails after max retries: "Connection lost" overlay with
  "Retry" button.

## Consequences

**Positive:**

- Clear separation: SSE composable = transport, Pinia stores = state, TresJS
  scene = rendering. Each layer has a single responsibility.
- Stores are reactive — Vue components and TresJS scene automatically
  re-render when store state changes.
- Full-state-on-reconnect handles missed events cleanly without complex
  event sequence tracking.
- Pagination keeps memory bounded — only visible history pages are in memory.
- Spectator mode is a simple boolean flag in the UI store.

**Negative:**

- Many stores (11) — but each is small and focused. Could consolidate later
  if boundaries blur.
- SSE event types must stay in sync between server and client. TypeScript
  shared types (ADR-0017 `lib/types/`) mitigate this.
- Full-state snapshot on reconnect could be large for long games with many
  facilities. Mitigated by sending only current state (not history) — history
  is paginated separately.
- 3D scene reading from stores every frame could cause unnecessary reactivity
  overhead. Mitigated by using `useRenderLoop` (reads store state imperatively,
  not via computed reactivity) for per-frame data, and Vue reactivity only
  for structural changes (add/remove markers).

## Alternatives Considered

- **Single monolithic store**: Simpler but harder to maintain — 130+
  resources, facilities, transports, events, actions, tech tree all in one
  store with one huge state object. Rejected for maintainability.
- **No Pinia (component-local state + provide/inject)**: Loses centralized
  state management; harder to share state between panels that aren't parent-
  child. Rejected.
- **Apollo Client / GraphQL**: Overkill — we have a REST API + SSE, not a
  GraphQL server. Adds complexity without benefit.
- **RxJS for SSE stream processing**: Powerful but adds a heavy dependency
  and a different paradigm (observables) that doesn't match Vue's reactivity
  model. The SSE composable + Pinia stores achieve the same result with Vue-
  native patterns.
- **WebSocket instead of SSE**: Bidirectional but we only need server→client
  for the web UI (player doesn't send commands). SSE is simpler, auto-
  reconnects, and works over standard HTTP.
