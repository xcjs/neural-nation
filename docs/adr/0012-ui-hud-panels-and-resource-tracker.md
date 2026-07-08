# ADR-0012: UI/HUD Panels and Resource Tracker

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0002, ADR-0006, ADR-0008 |

## Context

The player is a passive overseer watching the 3D earth. They need
non-3D UI panels to understand what the LLM is doing, track economic
progress, and monitor resource collection. The full periodic table (118
elements) plus bulk resources (wood, water, coal, etc.) must be
trackable — the player wants to see how much of each resource has been
collected vs. what remains in the ground.

## Decision

Implement a set of **overlay HUD panels** around the 3D earth viewport,
built with Vue 3 components + Tailwind CSS, styled to match the
wireframe/holographic aesthetic (dark backgrounds, translucent panels,
glowing accents, monospace data).

### Panel: Resource Tracker (Primary)

A **scrollable, filterable, sortable list** of all resources and elements
showing collection progress:

```
┌─────────────────────────────────────────────────────┐
│  RESOURCES                          [filter] [sort] │
│─────────────────────────────────────────────────────│
│  ELEMENTS                                           │
│  ● Fe  Iron         ████░░░░  1,240 / 8,000   15.5% │
│  ● Au  Gold         █░░░░░░░      12 / 200     6.0% │
│  ● Cu  Copper       ██░░░░░░    340 / 2,500   13.6% │
│  ● U   Uranium      ░░░░░░░░       0 / 50      0.0% │
│  ● Tc  Technetium   ░░░░░░░░       0 / 0   SYNTHETIC │
│  ...                                                │
│  BULK                                               │
│  ● Wood             ██████░░  5,200 / 10,000  52.0% │
│  ● Water            ███░░░░░  3,100 / 50,000   6.2% │
│  ● Coal             ██░░░░░░  1,800 / 12,000  15.0% │
│─────────────────────────────────────────────────────│
│  Showing 126 of 126          scroll for more         │
└─────────────────────────────────────────────────────┘
```

**Features:**
- **List entries**: One row per resource (118 elements + bulk resources).
  Each row shows: symbol, name, collected bar, collected / total, percentage.
- **Progress bar**: Horizontal bar showing collected vs. total estimated
  reserves. Color-coded by resource category (elements = blue/steel, bulk =
  green/amber).
- **Synthetic elements**: Elements with zero natural deposits show
  "SYNTHETIC" label instead of a progress bar. If the LLM later synthesizes
  them, the row updates to show synthesis output.
- **Undiscovered penalty**: Total reserves shown are for *discovered*
  deposits only. Undiscovered deposits don't count toward the total until
  the LLM surveys them. This means early game the tracker is sparse — it
  fills in as the LLM explores.
- **Filter**: Filter by category (elements, bulk, discovered, undiscovered,
  depleted, synthetic). Search by name/symbol.
- **Sort**: By atomic number (default for elements), alphabetical, %
  collected, total quantity, remaining quantity.
- **Scroll**: Virtualized list (e.g., `@tanstack/vue-virtual`) for smooth
  scrolling through 126+ rows.
- **Click**: Clicking a resource opens a detail view showing all deposits
  of that resource with their locations, quantities, and which extractor
  facilities (if any) are working them.

### Panel: Event Feed

A chronological, auto-scrolling log of LLM actions and game events:

```
┌─────────────────────────────────────────┐
│  EVENT LOG                              │
│─────────────────────────────────────────│
│  T#0247  Built iron mine at 35.2N 139.7E│
│  T#0248  Survey complete: found Au at ...│
│  T#0251  Transport link: mine → smelter │
│  T#0253  Iron stockpile: 0 → 50         │
│  T#0260  Smelter operational            │
│  T#0265  Produced 10 iron from 20 ore   │
│  ...                                    │
│─────────────────────────────────────────│
│  Auto-scroll [ON]          Pause feed   │
└─────────────────────────────────────────┘
```

- Latest events at top (or bottom, configurable).
- Tick number prefix (`T#NNNN`) for temporal context.
- Color-coded by event type (build = green, survey = cyan, production =
  amber, depletion = red, error = bright red).
- Click an event to highlight the relevant facility/deposit on the globe.

### Panel: Game Overview / Stats

A compact summary bar or panel:

```
┌──────────────────────────────────────────────┐
│  Tick #0265  │  12 facilities  │  8 transports │
│  3,450 units produced  │  2,100 units in transit │
│  [⏸ Pause]  [⟳ Step]  [⚙ Revoke token]        │
└──────────────────────────────────────────────┘
```

### Panel: Facility Detail (on-click)

When the player clicks a facility marker on the globe, a side panel opens:

```
┌─────────────────────────────────────────┐
│  ⬢ Iron Mine #4                         │
│  35.2°N, 139.7°E     Operational        │
│─────────────────────────────────────────│
│  DEPOSIT                                │
│  Fe (Iron) — grade 0.72, depth: shallow │
│  Remaining: 6,760 / 8,000               │
│─────────────────────────────────────────│
│  OUTPUT BUFFER                          │
│  Iron ore: 120 / 500 (24%)              │
│─────────────────────────────────────────││  TRANSPORTS                             │
│  → Smelter #1 (conveyor) 50/tick        │
│  → Storage #2 (road)    20/tick         │
│─────────────────────────────────────────│
│  PRODUCTION                              │
│  80 ore/tick  │  Power: ✓  │  Eff: 90%  │
└─────────────────────────────────────────┘
```

### Panel: MCP Connection / Token Management

A small panel (or modal) showing:
- MCP connection status (connected/disconnected — is an LLM client
  actively connected via SSE?).
- MCP URL with copy-to-clipboard (the full URL from ADR-0004).
- Token revocation button (with confirmation).
- New token mint button (generates new URL, invalidates old).

### Layout

```
┌──────────────────────────────────────────────────────┐
│  [Game Overview Bar]                                 │
├──────────┬───────────────────────────┬───────────────┤
│          │                           │               │
│  Event   │                           │   Resource    │
│  Feed    │       3D Earth            │   Tracker     │
│  (left)  │       (center)            │   (right)     │
│          │                           │               │
│          │                           │               │
├──────────┴───────────────────────────┴───────────────┤
│  [MCP Status / Token Management]                     │
└──────────────────────────────────────────────────────┘
```

- Panels are collapsible — player can hide all panels for a full-screen
  globe view.
- Facility detail panel slides in from the left when a facility is clicked,
  overlaying the event feed.
- Responsive: on mobile, panels collapse to tabs or a bottom sheet.

### Real-Time Updates

- Panels subscribe to server-side SSE for game state changes (ADR-0006:
  ticks only happen on MCP calls, so updates arrive in bursts when the LLM
  is active, then go quiet when idle).
- Resource tracker updates incrementally — bars animate smoothly on
  collection changes.
- Event feed appends new events as they arrive.

## Consequences

**Positive:**
- Resource tracker gives the player a tangible sense of progress against
  the full periodic table — a core satisfaction driver.
- Scrollable virtualized list handles 126+ entries without performance
  issues.
- Click-to-detail creates a tight loop between globe observation and data
  inspection.
- Panels match the holographic aesthetic, reinforcing the command-center
  feel.

**Negative:**
- More UI surface area to build and maintain than a minimal HUD.
- Virtualized scrolling adds a dependency (`@tanstack/vue-virtual` or
  similar).
- Real-time SSE updates for 126 resource bars + event feed + facility
  details could be bandwidth-heavy; should send deltas, not full state.

## Alternatives Considered

- **Periodic table grid instead of scrollable list**: A visual periodic
  table layout (groups/periods) is appealing but harder to show bulk
  resources alongside, and harder to sort/filter. Could be an alternate view
  mode in the future.
- **No resource tracker (globe-only)**: Rejected — the player specifically
  wants to track element collection progress numerically.
- **Modal-only panels (no persistent overlay)**: More clicks to see
  status; persistent panels are better for passive observation.