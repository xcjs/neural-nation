# ADR-0008: Visual Representation of Facilities

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |

| Relates to | ADR-0002, ADR-0014, ADR-0015, ADR-0023 |

## Context

Facilities are viewed from an orbital perspective — the player is looking at
the whole earth, not walking through cities. Individual buildings would be
too small to see. The visual appeal is glowing geometric primitives: dots,
squares, short line segments, and connecting arcs that form a luminous network
across the wireframe globe.

**Particle clouds**: Plain geometric outlines for facilities feel too flat and
sterile. The player wants facilities to feel alive — not just static shapes
but **particle clouds**: small swarming points of light around each facility
that convey activity, scale, and energy. A mining operation should feel
different from a research station; a city should feel different from a lone
extractor. Particles give each facility a sense of being a living, working
system rather than a hollow outline.

## Decision

Render facilities and transport links as **glowing geometric primitives
surrounded by particle clouds** using additive blending and emissive
materials. Shape encodes facility type; particle cloud density, motion, and
behavior encode activity level and scale.

### Facility Markers

Each facility is rendered as a small geometric primitive on the globe surface
at its lat/lon position:

| Facility Tier | Shape | Notes |
|---|---|---|
| Extractor (mine, well, quarry) | Diamond (rotated square) | Warm color (amber/orange) |
| Farm / water pump | Small circle | Green for farms, blue for water |
| Processor (smelter, refinery) | Square | Medium warm color (orange/red) |
| Factory | Square with inner square (hollow) | Bright accent color |
| Power plant | Hexagon | Yellow/white glow |
| Storage | Triangle (point up) | Cool color (cyan/blue) |
| Research / advanced | Star (5-point) | Purple/magenta |
| Under construction | Pulsing dot (faded) | Dim, blinking |

**Sizing**: Base size proportional to facility level/capacity. Min size ensures
visibility at orbital zoom; max size prevents overlap at extreme zoom.

**Glow**: Each marker uses an emissive material with additive blending. A
faint point light at the marker position casts subtle color onto the wireframe
globe surface. Bloom post-processing effect enhances the glow.

### Facility Particle Clouds

Each facility is surrounded by a **particle cloud** — a swarm of small glowing
points that orbit, drift, and pulse around the facility marker. This gives
facilities a sense of being active, living installations rather than static
outlines. Particles are NOT the marker itself; they're an ambient aura that
makes each facility feel like a working industrial site.

**Particle behavior by facility type:**

| Facility Type | Particle Behavior | Visual |
|---|---|---|
| Extractor (mine, well, quarry) | Particles drift upward from the marker like dust/debris being kicked up; density ∝ extraction rate | Amber/orange rising sparks |
| Farm / forestry | Slow swirling particles around the marker, gentle circular motion; density ∝ crop growth | Green motes drifting in lazy circles |
| Water pump / desalination | Particles fall and ripple outward like rain droplets; density ∝ throughput | Blue droplet-like points spreading outward |
| Processor (smelter, refinery) | Energetic particles orbiting tightly, faster motion; some flicker; density ∝ production rate | Orange/red sparks in tight orbit |
| Factory | Particles stream inward from transport link directions, converge on marker, then stream outward as output; density ∝ throughput | Multi-colored flow particles converging/diverging |
| Power plant (fossil/biomass) | Particles rise upward like smoke/exhaust; density ∝ output | Gray/black rising particles |
| Nuclear reactor | Tight, contained particle orbit with occasional bright flash; glow intensity ∝ output | Orange/yellow contained swarm with flashes |
| Solar farm | Particles hover flat and stationary above the marker like a panel field catching light; brightness ∝ sunlight | Yellow flat-layered points |
| Wind farm | Particles rotate around the marker in a circle mimicking turbine blades | Cyan rotating particles |
| Soylent plant | Dark red particles spiraling inward (consuming) with occasional bright flash; visually unsettling | Dark red/black inward spiral |
| Fusion reactor | Brilliant white-blue particles in a dense contained sphere; very bright; visually distinct from everything else | White-blue dense sphere |
| Storage | Particles slowly orbit the marker in a loose halo; density ∝ fill level | Cyan/blue halo, denser when full |
| Spaceport | Particles launch upward in streaks (launch trails) when a mission is active; otherwise a calm upward-drifting cloud | White/cyan launch trails on active launches |
| Space station (orbital) | Particles orbit the station in a structured ring; density ∝ crew/activity | White ring of orbiting points |
| Research / advanced | Particles move in complex, non-repeating patterns (Lissajous-like curves); visually exotic | Purple/magenta complex paths |
| Under construction | Particles swirl chaotically around a pulsing marker; settles into facility-type pattern when complete | Dim, chaotic swirl → settles |
| Terraforming facility (excavator/dredger/terraformer/planetary_engine) | Earth-toned particles (brown/amber) that churn and swirl violently during active operations; density ∝ operation scale. Planetary engine has massive particle storm visible from orbit. | Brown/amber violent churn, scale-dependent |

**Particle cloud properties:**
- **Density**: Number of particles ∝ facility throughput/capacity. An idle
  mine has few particles; a high-output mine has many. This lets the player
  gauge activity at a glance without reading numbers.
- **Motion**: Each facility type has a characteristic motion pattern (rising,
  orbiting, streaming, swirling). This makes facility types visually
  distinguishable even without the geometric marker shape.
- **Color**: Matches the facility's color palette (extractors = warm,
  power = bright, biological = green, soylent = dark red, etc.).
- **Size**: Individual particles are small (1-3px at medium zoom) with
  additive blending so overlapping particles brighten — a dense cluster
  glows brighter than a sparse one.
- **LOD**: At far zoom, particle clouds collapse to a single glow point
  (marker + cloud merge). At medium zoom, clouds are visible but simplified
  (fewer particles, simpler motion). At close zoom, full particle count and
  motion patterns visible.

**Implementation:**
- Use Three.js `Points` with custom `ShaderMaterial` for particle clouds.
  Each facility has a particle system with parameters (count, motion type,
  speed, color, spread) determined by facility type and current throughput.
- Particles are GPU-driven (position update in vertex shader using time +
  facility-specific motion equation) — no CPU per-particle updates.
- Facility creation/destruction smoothly fades particle clouds in/out.
- When throughput changes, particle density animates smoothly (not instant
  pop) — particles spawn/despawn over ~1 second.
- A single shared `BufferGeometry` per facility type, with per-instance
  uniforms for position/scale/activity. Batches of same-type facilities can
  share a draw call where possible.

### Transport Links

Transport links between facilities render as **glowing arcs** following
great-circle paths along the globe surface, with **flowing particle streams**
along the arc to visualize active resource movement:

- **Arc shape**: Quadratic Bezier curve with control point lifted slightly
  above the surface midpoint, creating a gentle rise over the globe curvature.
- **Arc line**: Thin glowing line (additive blending) forming the path.
- **Flow particles**: Instead of (or in addition to) dashed pulse animation,
  small glowing particles travel along the arc from source to destination,
  like sparks flowing through a wire. Particle count ∝ flow rate; particle
  speed = transport speed. This is more visually rich than a simple dash
  animation and matches the particle cloud aesthetic of facilities.
- **Color**: Determined by the resource type flowing (iron = steel blue, oil =
  dark amber, water = cyan, electricity = yellow-white, wood = green, etc.).
- **Thickness**: Proportional to transport capacity.
- **Idle links**: Dim/base color with no flowing particles when no flow is
  assigned.
- **Convergence at facilities**: Flow particles arrive at the destination
  facility and merge into its particle cloud (visual continuity — the
  resource "feeds into" the facility). Similarly, particles emerge from the
  source facility's cloud and begin traveling along the arc.

**Power lines**: Thinner, straighter arcs with a distinct electric-blue flicker
animation rather than steady pulse.

### Color System

Facility and transport colors follow a consistent palette:

- **Cool tones** (cyan, blue, teal): infrastructure, storage, water — the
  baseline earth color family.
- **Warm tones** (amber, orange, red): extractors, processors — industry.
- **Bright accents** (yellow, white): power, energy.
- **Exotic tones** (purple, magenta): advanced/synthesis — visually rare to
  signal endgame activity.
- **Green**: biological/natural resources (wood, food, farms).

### Cities \u0026 Dense Facility Clusters

When many facilities cluster in a region (e.g., a developed industrial zone),
their individual particle clouds merge into a **dense, bright, energetic
particle field** — a "city glow." This isn't a separate render; it's the
natural result of many overlapping particle clouds with additive blending.
The effect is that industrialized regions of the earth glow brighter and
busier than empty regions, giving the player an immediate visual sense of
where the LLM has built up civilization. A fully developed region looks like
a luminous swarm of activity; an untouched region is dark wireframe.

### Terraforming Visual Cues (ADR-0023)

Terraforming operations have distinct visual feedback on the globe:

- **Active terraforming**: The terraforming facility emits a distinctive
  particle cloud — earth-toned particles (brown/amber) that churn and swirl
  violently. Density and spread ∝ operation scale. A planetary engine's
  particle storm is visible from orbital zoom.
- **Modified terrain**: Changed cells get a subtle color shift — slightly
  warmer/different hue than base terrain wireframe. Fades over many ticks
  as the terrain "naturalizes."
- **Water creation**: New water cells (canals, reservoirs) appear with the
  blue ocean glow, animating in as water "fills" the space.
- **Land creation**: Raised land appears with the land wireframe color,
  animating upward as it rises from the ocean.
- **Terrain mesh animation**: Affected vertices lerp to new positions over
  ~1-2 seconds when terrain changes (per ADR-0002). Not instant pop.
- **Continental-scale operations**: The affected region shows dramatic
  visual disturbance — massive particle clouds, wireframe distortion,
  warning markers — during the operation.
- **Modification history overlay**: Optional UI toggle that highlights all
  modified cells, color-coded by operation type. Lets the player see at a
  glance how the agent has reshaped the world over time.

### Performance

- Use **instanced meshes** for facility markers: one draw call per shape type,
  per-instance transform for position/scale.
- **Particle clouds**: GPU-driven `Points` with custom shader — position
  updates happen in the vertex shader (no CPU per-particle loop). Each
  facility's particle system uses a shared geometry buffer with per-instance
  uniforms. Target ~50-200 particles per facility at medium zoom; fewer at
  far zoom. With ~500 facilities, that's 25K-100K particles — manageable on
  GPU with a single shader pass per facility type.
- Transport arcs: batch by color into line segment buffers. Flow particles
  along arcs use a separate `Points` system but same GPU-driven approach.
- Bloom post-processing via Three.js `UnrealBloomPass` (TresJS post-fx
  integration or custom `EffectComposer`).
- **Adaptive particle budget**: If frame rate drops, reduce particle count
  per facility globally (quality slider in settings). At minimum quality,
  particles reduce to simple glow points.
- Target: 60fps with up to ~500 markers + ~200 transport arcs + ~100K
  particles.

### LOD (Level of Detail)

- **Far zoom** (whole earth visible): Markers as single-pixel points with
  glow; particle clouds collapse into the marker glow (no individual
  particles visible); transport arcs as thin lines with no flow particles.
  Facility type not distinguishable — only presence and color.
- **Medium zoom** (continent level): Markers show shape and relative size;
  particle clouds visible but simplified (fewer particles, simpler motion);
  transport arcs show flow particles.
- **Close zoom** (region level): Markers show full shape with optional label
  text; particle clouds at full density with characteristic motion patterns;
  transport arcs show flow direction clearly; dense clusters reveal
  individual facility clouds merging into city glow.

## Consequences

**Positive:**
- Glowing primitives + particle clouds on a wireframe globe create the sci-fi
  command-center aesthetic the player wants — facilities feel alive and busy,
  not static.
- Particle cloud behavior encodes facility type AND activity level — the player
  can tell at a glance whether a mine is producing or idle, whether a factory
  is running or shut down, without reading any numbers.
- City glow effect (overlapping clouds) gives an immediate visual read on
  industrialization density — developed regions glow, undeveloped don't.
- Flow particles on transport arcs create visual continuity with facility
  clouds — resources visibly flow from facility to facility.
- Shape + color + particle motion encode a lot of information without text,
  keeping the view clean.
- GPU-driven particles keep performance acceptable at scale.

**Negative:**
- Bloom post-processing + particle systems have a performance cost; needs
  adaptive quality settings for lower-end devices.
- Custom shader work for particle motion is more complex than simple
  instanced meshes — each facility type needs its own motion equation.
- At extreme zoom-out, all markers + clouds converge to a glow blob — LOD
  must handle this gracefully (cluster simplification may be needed for
  1000+ markers).
- Color blindness: shape + particle motion help, but color is still primary
  — ensure shapes and motion patterns are distinguishable independently.
- Particle clouds add visual noise; too many facilities in one region could
  become a chaotic glow. LOD + additive blending should keep it readable,
  but needs testing.

## Alternatives Considered

- **3D building models**: Rejected — at orbital scale they'd be invisible or
  absurdly oversized. Geometric abstraction is the right call.
- **Sprite/textured billboards**: More detail possible but breaks the
  wireframe/holographic aesthetic. Emissive primitives + particles fit better.
- **Static outlines only (no particles)**: Rejected per user request —
  outlines feel flat and sterile. Particle clouds make facilities feel
  active and alive, which is the core visual appeal.
- **Sprite-based particle systems (CPU-driven)**: Rejected — CPU particle
  updates for hundreds of facilities would tank performance. GPU shader-driven
  particles are necessary.
- **No LOD (always full detail)**: Would limit game scale to ~100 facilities
  before frame drops. LOD is necessary for the "watch it grow" appeal.