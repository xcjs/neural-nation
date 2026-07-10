# ADR-0012: UI/HUD Panels and Resource Tracker

| Field      | Value                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| Status     | Proposed                                                                       |
| Date       | 2026-07-08                                                                     |
| Deciders   | Project owner                                                                  |
| Relates to | ADR-0002, ADR-0004, ADR-0006, ADR-0008, ADR-0015, ADR-0018, ADR-0025, ADR-0026 |

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

A **scrollable, filterable, sortable list** of all resources organized into
four categories (renewable, non-renewable, periodic table elements,
manufactured) per ADR-0003/ADR-0018, showing collection progress:

```
┌─────────────────────────────────────────────────────┐
│  RESOURCES                          [filter] [sort] │
│─────────────────────────────────────────────────────│
│  ▸ RENEWABLE                                        │
│  ● Population   ▲ 847,200  growing     not depletable│
│  ● Wood         ██████░░  5,200 / 10,000  52.0%    │
│  ● Water        ███░░░░░  3,100 / 50,000   6.2%    │
│  ● Arable Land  ████░░░░    640 / 2,000    32.0%    │
│  ● Biomass      ██░░░░░░    180 / 1,500    12.0%    │
│  ● Solar Cap.   █░░░░░░░     12 / 800       1.5%    │
│                                                     │
│  ▸ NON-RENEWABLE                                    │
│  ● Coal          ██░░░░░░  1,800 / 12,000  15.0%   │
│  ● Oil \u0026 Gas    █░░░░░░░    820 / 9,000    9.1%   │
│  ● Stone/Gravel  ████░░░░  4,400 / 20,000  22.0%   │
│  ● Uranium      ░░░░░░░░       0 / 50      0.0%    │
│                                                     │
│  ▸ ELEMENTS (118)                                  │
│  ● Fe  Iron       ████░░░░  1,240 / 8,000   15.5%  │
│  ● Au  Gold       █░░░░░░░      12 / 200     6.0%  │
│  ● Cu  Copper     ██░░░░░░    340 / 2,500   13.6%  │
│  ● U   Uranium    ░░░░░░░░       0 / 50      0.0%  │
│  ● Tc  Technetium ░░░░░░░░       0 / 0   SYNTHETIC │
│  ...                                                │
│  ▸ MANUFACTURED                                    │
│  ● Steel         ███░░░░░    600 / —      produced  │
│  ● Electronics   █░░░░░░░     20 / —      produced  │
│  ● Machinery     ░░░░░░░░      0 / —      produced  │
│  ● Fuel          ██░░░░░░    180 / —      produced  │
│  ...                                                │
│─────────────────────────────────────────────────────│
│  Showing 155 of 155          scroll for more         │
└─────────────────────────────────────────────────────┘
```

**Features:**

- **Four categories** (collapsible sections per ADR-0003/ADR-0018):
  1. **Renewable** — resources that regrow over time (wood, water, arable
     land, biomass/crops, solar/wind/hydro capacity). Also includes
     **population** as a special renewable "resource" — it grows over time
     per the logistic model in ADR-0003/ADR-0015. Population shows a trend
     arrow (▲▼●) instead of a depletion progress bar, since it is not
     "collected" from a finite deposit.
  2. **Non-renewable** — finite deposits that deplete when extracted (coal,
     oil & gas, stone/gravel, uranium/radioactive ores).
  3. **Elements** — all 118 periodic table elements, split by naturally
     occurring vs. synthetic.
  4. **Manufactured** — resources produced by recipes (ADR-0018): Iron,
     Steel, Electronics, Machinery, Fuel, Plastics, etc. These show current
     stockpile and production rate (e.g., "+12/tick") instead of
     collected/total, since they are not mined from finite deposits. Color:
     purple/magenta to distinguish from natural resources.
- **List entries**: One row per resource. Each row shows: symbol (for
  elements), name, progress bar, collected / total, percentage.
- **Progress bar**: Horizontal bar showing collected vs. total estimated
  reserves. Color-coded by category (renewable = green, non-renewable =
  amber, elements = blue/steel). Population uses a trend indicator instead
  of a bar.
- **Renewable resources**: Show a regeneration indicator (↻) if currently
  regrowing, or a depletion warning (▼) if being harvested faster than
  regeneration rate. This tells the player whether the LLM is managing
  renewables sustainably.
- **Synthetic elements**: Elements with zero natural deposits show
  "SYNTHETIC" label instead of a progress bar. If the LLM later synthesizes
  them, the row updates to show synthesis output.
- **Undiscovered penalty**: Total reserves shown are for _discovered_
  deposits only. Undiscovered deposits don't count toward the total until
  the LLM surveys them. This means early game the tracker is sparse — it
  fills in as the LLM explores.
- **Filter**: Filter by category (renewable, non-renewable, elements,
  discovered, undiscovered, depleted, synthetic, sustainable/unsustainable).
  Search by name/symbol.
- **Sort**: By atomic number (default for elements), alphabetical, %
  collected, total quantity, remaining quantity.
- **Scroll**: Virtualized list (e.g., `@tanstack/vue-virtual`) for smooth
  scrolling through 130+ rows.
- **Click**: Clicking a resource opens a detail view showing all deposits
  of that resource with their locations, quantities, and which extractor
  facilities (if any) are working them. For population, clicking opens the
  environmental status detail (ADR-0015).

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

### Panel: Action Console (Searchable History)

A dedicated console panel that logs every MCP tool invocation the LLM makes,
with full searchable history. This is distinct from the event feed (which
shows game-world events like "iron mine built") — the action console shows
the **raw LLM actions** including tool name, arguments, result status, and
the LLM's reasoning context if available.

```
┌──────────────────────────────────────────────────────┐
│  ACTION CONSOLE                 [search: _________]  │
│──────────────────────────────────────────────────────│
│  T#0247  build_facility                              │
│    args: {type:"mine", lat:35.2, lon:139.7, ...}     │
│    result: ✓ success — mine #4 created               │
│    impact: +pollution 2/tick, -habitat 0.1           │
│  T#0248  survey_region                                │
│    args: {lat:35.2, lon:139.7, radius:50}             │
│    result: ✓ found 3 deposits (Fe, Cu, Au)           │
│  T#0251  build_transport                              │
│    args: {type:"conveyor", from:4, to:1}              │
│    result: ✓ transport #8 created                    │
│    terrain: path crosses 1 hill cell (cost +20%)      │
│  T#0260  set_production_target                        │
│    args: {facility_id:1, target:"iron", qty:80}       │
│    result: ✓ target set                               │
│  T#0275  build_facility                               │
│    args: {type:"soylent_plant", lat:40.0, lon:-74.0}  │
│    result: ⚠ built — POPULATION -5/tick               │
│──────────────────────────────────────────────────────│
│  [filter: all ▾]  [✓ errors only]  1,847 actions      │
│  ← prev page    page 37 / 74    next page →          │
└──────────────────────────────────────────────────────┘
```

**Features:**

- **Searchable**: Full-text search across tool name, arguments, results, and
  tick number. Player can search "soylent" to find every time the LLM
  built/used a soylent plant, or search "error" to find failed actions.
- **Filter**: By tool type (build_facility, survey_region, build_transport,
  etc.), by result status (success/warning/error), by tick range.
- **Pagination**: Actions are paginated (e.g., 25/page) with search jumping
  to matching results. History is unlimited — every MCP call since game
  start is retained.
- **Detail expansion**: Click an action to expand and see full arguments,
  full result payload, environmental impact notes (ADR-0015), and the
  post-action game state snapshot (key metrics at that tick).
- **Impact tags**: Each action is tagged with its environmental/humanity
  impact (pollution delta, forest delta, population delta, etc.) from
  ADR-0015. This lets the player trace "when did pollution start rising?"
  directly to the actions that caused it.
- **Export**: Player can export the full action history as JSON or CSV for
  external analysis.
- **Visual**: Console-style monospace font, color-coded by result status
  (green = success, amber = warning, red = error). Impact tags use
  color-coded badges (red for negative humanity, green for positive).

**Data source**: Actions are logged to an `actions` table in the per-game
SQLite DB (one row per MCP tool call). The console reads from this table with
pagination + search via server-side queries (client-side filtering of the full
history would be too large for long games).

```
actions
  id            INTEGER PRIMARY KEY
  game_id       TEXT (token)
  tick          INTEGER
  timestamp     REAL (Unix time)
  tool_name     TEXT
  arguments     TEXT (JSON)
  result_status TEXT  -- 'success' | 'warning' | 'error'
  result_data   TEXT (JSON)
  impact_tags   TEXT (JSON — pollution/forest/population deltas)
  state_snapshot TEXT (JSON — key metrics post-action)
```

This table is populated on every MCP call (before the tick is processed and
the result is returned to the LLM). The web UI queries it via a paginated
API endpoint with search/filter parameters.

### Panel: Environmental Status (ADR-0015 link)

A compact panel showing the humanity/environmental metrics from ADR-0015:

```
┌──────────────────────────────────────────┐
│  ENVIRONMENTAL STATUS                    │
│──────────────────────────────────────────│
│  Population    ▲ 847,200  (+1,200/tick) │
│  Pollution     ▲ 340 ppm   (+5/tick)   │
│  Forest cover  ▼ 62%       (-0.3/tick)  │
│  Water quality ▼ 78%       (-0.1/tick)  │
│  Biodiversity  ▼ 71%       (stable)     │
│──────────────────────────────────────────│
│  [pollution overlay] [biome overlay]     │
└──────────────────────────────────────────┘
```

- Trend arrows (▲▼●) show rising/falling/stable per metric.
- Toggle buttons activate the globe overlays (pollution heatmap, biome
  degradation colors) from ADR-0015.
- Color-coded values: green = healthy, amber = degrading, red = critical.

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

### Panel: Tech Tree (ADR-0018 link)

A visual tree showing research progress and unlocked technologies:

```
┌──────────────────────────────────────────────────────┐
│  TECH TREE                          [filter: all ▾]  │
│──────────────────────────────────────────────────────│
│  TIER 0 (Starting)                                  │
│  ✓ Basic Extraction    ✓ Basic Processing           │
│  ✓ Basic Power         ✓ Basic Transport            │
│  ✓ Basic Construction                                │
│                                                      │
│  TIER 1                                              │
│  ✓ Advanced Metallurgy  ✓ Industrial Chemistry       │
│  ✓ Advanced Fossil      ◐ Nuclear Power (45%)        │
│  ○ Precision Mfg       ○ Biotechnology               │
│                                                      │
│  TIER 2                                              │
│  ⊘ Machinery & Automation  ⊘ Fusion Power             │
│  ⊘ Advanced Materials                               │
│                                                      │
│  TIER 3                                              │
│  ⊘ Aerospace Engineering                            │
│  ⊘ Orbital Infrastructure                            │
│  ⊘ Deep Space Technology                            │
│                                                      │
│  Legend: ✓ completed  ◐ in progress  ○ available     │
│         ⊘ locked (prereq needed)                     │
└──────────────────────────────────────────────────────┘
```

- **Status icons**: ✓ completed, ◐ in progress (with % bar), ○ available
  (prerequisites met, not started), ⊘ locked (prerequisites unmet).
- **Click**: Clicking a tech node shows its description, prerequisites,
  research cost, what it unlocks (recipes, facility types), and which
  research_lab (if any) is working on it.
- **Filter**: By category (Metallurgy, Chemistry, Power, Space), by status.
- **Visual**: Nodes are color-coded by branch (Metallurgy = orange, Chemistry
  = green, Power = yellow, Space = cyan). Completed nodes glow; locked nodes
  are dimmed. Prerequisite connections shown as faint lines.
- This panel helps the player understand the LLM's research strategy and
  progression through the tech tree.

### Panel: MCP Connection / Token Management

A small panel (or modal) showing:

- MCP connection status (connected/disconnected — is an LLM client
  actively connected via SSE?).
- MCP URL with copy-to-clipboard (the full URL from ADR-0004).
- Token revocation button (with confirmation).
- New token mint button (generates new URL, invalidates old).
- **Spectating link** (ADR-0025): share icon button that opens a popover with
  the spectating URL (`/watch?token={publicToken}`), copy-to-clipboard button,
  and "Regenerate link" option. The spectating URL is read-only — friends can
  watch but not control.
- Hidden in spectator mode (spectators don't see token management or
  spectating controls).

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
- **No mobile layout** (ADR-0009): desktop-only for v1. Mobile browsers show a
  warning overlay instead of the UI. No responsive panel arrangement is
  implemented.
- **Spectator mode**: when viewing via public token (ADR-0025), owner-only
  controls (pause, step, revoke, mint, spectating link, delete game) are
  hidden. A "Spectating" badge replaces control buttons in the game overview
  bar.

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
