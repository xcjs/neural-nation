# ADR-0013: Terrain & Elevation System

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0002, ADR-0003, ADR-0007, ADR-0011 |

## Context

The earth is not flat. Real-world terrain elevation varies dramatically —
mountain ranges, plateaus, ocean trenches, coastal plains. Without a terrain
model, the LLM could route transport across the Himalayas as easily as across
the Netherlands, which removes a major real-world constraint on industrial
logistics. Terrain should be a variable the LLM must reason about: trucks can't
cross mountains without tunnels, pipelines through ranges are expensive,
and facilities at extreme elevation face construction penalties.

Additionally, terrain affects the **visual** identity of the game — elevation
data drives the wireframe/holographic earth's surface geometry, giving
mountain ranges and trenches visible form rather than a smooth sphere.

## Decision

Introduce a **terrain elevation layer** stored in the template DB and consulted
by the transport pathfinding and facility placement systems.

### Elevation Data

- **Source**: SRTM (Shuttle Radar Topography Mission) digital elevation model,
  which provides near-global elevation at ~90m resolution. Too large to bundle
  raw — downloaded and downsampled by `scripts/fetch-geological-data.ts` into
  a manageable grid (see ADR-0011 for the download pipeline).
- **Resolution**: Downsample to a **0.1° × 0.1° grid** (~11 km cells). This
  gives ~648 × 1296 = ~839,808 grid cells covering the earth's surface. Each
  cell stores a single elevation value in meters. Ocean cells are negative
  (depth below sea level), land cells are positive.
- **Storage**: A `terrain` table in the template DB:

```
terrain
  id            INTEGER PRIMARY KEY
  lat_index     INTEGER   -- grid row (0 = -90°, 647 = +90° approx)
  lon_index     INTEGER   -- grid col (0 = -180°, 1295 = +180° approx)
  lat           REAL       -- center latitude of cell
  lon           REAL       -- center longitude of cell
  elevation_m   REAL       -- elevation in meters (negative = ocean)
  terrain_class TEXT       -- 'ocean' | 'coastal' | 'plain' | 'hill' | 'mountain' | 'high_mountain'
  is_land       INTEGER    -- 1 if elevation > 0, 0 if ocean
```

- **Terrain classes** (derived from elevation):
  - `ocean` — elevation < 0m
  - `coastal` — 0–200m
  - `plain` — 200–800m
  - `hill` — 800–2000m
  - `mountain` — 2000–4000m
  - `high_mountain` — 4000m+

### Terrain as a Transport Constraint

Transport links between facilities must traverse terrain. The pathfinding
system (ADR-0007) evaluates the great-circle path between two facilities and
checks terrain along the way:

- **Roads**: Cannot cross `mountain` or `high_mountain` cells without a
  `tunnel` infrastructure upgrade. Roads through `hill` terrain have reduced
  speed/capacity and higher construction cost. Roads through `ocean` cells
  require a `bridge` (or the route must go around via land).
- **Conveyors**: Same constraints as roads (surface transport).
- **Pipelines**: Can traverse `hill` and `mountain` with increased cost but
  cannot cross `high_mountain` without specialized pumping stations. Can cross
  shallow `ocean` (coastal) with increased cost; deep ocean requires subsea
  pipeline (much higher cost).
- **Power lines**: Can cross all terrain including mountains (with cost
  penalty) and shallow ocean. High mountains still require transmission
  towers (cost multiplier).

### Terrain Infrastructure Upgrades

The LLM can build terrain-crossing infrastructure to overcome constraints:

- **`tunnel`**: Enables roads/conveyors to pass through mountain cells.
  Construction cost scales with mountain length. Requires a separate
  `build_transport` call with type `tunnel` or an upgrade to an existing
  road.
- **`bridge`**: Enables roads/conveyors to cross ocean/coastal cells.
- **`pumping_station`**: Enables pipelines through mountains/high mountains.
- **`transmission_tower`**: Enables power lines through high mountains.
- **`subsea_pipeline`**: Enables pipelines across deep ocean.

These are modeled as **transport link modifiers** — the LLM must build the
base transport link AND the terrain modifier. The MCP tooling surfaces this:
when `build_transport` fails due to terrain, the error message tells the LLM
which terrain obstacles were encountered and what modifier is needed.

### Facility Placement & Terrain

- Facilities can be placed on any land cell (elevation > 0).
- **Construction cost modifier**: Facilities in `mountain`/`high_mountain`
  terrain cost more to build (logistical difficulty). Extractors in mountains
  may have access to different deposits (hard-rock mining).
- **Ocean facilities**: Certain facility types (`offshore_platform` for
  oil/gas, `desalination_plant` for water) can be placed on ocean cells.
  These are new extractor variants that the LLM can build in shallow coastal
  waters.
- **Elevation penalty**: Facilities at extreme elevation (>3000m) have a
  production efficiency penalty (logistical challenges, thin air for
  combustion-based power).

### Terrain Visualization (ADR-0002 link)

The earth's surface geometry is displaced by elevation data:
- The IcosahedronGeometry base mesh vertices are displaced along normals by
  elevation (scaled — not real-world proportions, but enough to show
  mountain ranges as raised areas and ocean trenches as depressed areas).
- Wireframe rendering shows terrain as denser line patterns at higher
  elevations; ocean areas use a different color/glow (bluish) to distinguish
  from land (greenish-white).
- Terrain class can be color-coded subtly in the wireframe.

### MCP Tools — Terrain-Aware Responses

- `build_transport` returns terrain analysis: the planned path, terrain
  classes encountered, and whether the link is feasible (or what modifiers
  are needed).
- `survey_region` returns elevation/terrain info for the surveyed area
  alongside resource deposits — the LLM learns the terrain as it surveys.
- `get_game_state` / `list_facilities` can include terrain class at each
  facility location.
- New read-only tool: `get_terrain_path(from_lat, from_lon, to_lat, to_lon)`
  — returns the terrain profile along a path, helping the LLM plan routes
  before committing to `build_transport`.

## Consequences

**Positive:**
- Terrain adds a rich strategic layer — the LLM must plan routes around or
  through mountains, factor in tunnel/bridge costs, and choose facility
  locations with terrain in mind.
- Visual payoff: mountain ranges and ocean trenches are visible on the
  wireframe earth, making the globe feel like a real planet.
- Real-world data (SRTM) gives authentic terrain that players recognize
  (Himalayas, Andes, Mid-Atlantic Ridge).
- Terrain infrastructure upgrades (tunnels, bridges) add more buildable
  objects for the LLM and more glowing markers on the globe.

**Negative:**
- SRTM data download + downsampling adds complexity to the template build
  pipeline. The downsampled grid (~840K rows) increases template DB size.
- Pathfinding with terrain constraints is more complex than simple
  great-circle routing — needs a grid-based pathfinder (A* on the elevation
  grid) or at minimum a terrain-along-path checker.
- Terrain modifiers (tunnels, bridges, pumping stations) add schema
  complexity and more facility/transport subtypes.
- The LLM must understand terrain constraints — MCP error messages must be
  clear and actionable ("Cannot build road through mountain at 28°N, 87°E —
  requires tunnel upgrade").

## Alternatives Considered

- **No terrain (flat earth)**: Rejected — the user specifically wants terrain as
  a variable. Without it, transport is trivial and the globe is less visually
  interesting.
- **Procedural terrain (Perlin noise instead of real data)**: Rejected for the
  same reason we use real geological data — real terrain is recognizable and
  authentic. Procedural terrain would look generic.
- **Coarser grid (1° × 1°)**: Considered to reduce DB size, but 1° cells
  (~111 km) are too coarse to capture major mountain ranges as distinct
  obstacles. 0.1° is a good balance of fidelity vs storage.
- **Terrain as purely visual (no gameplay effect)**: Rejected — terrain must
  matter mechanically, not just cosmetically, to give the LLM meaningful
  constraints.