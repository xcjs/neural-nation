# ADR-0008: Visual Representation of Facilities

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |

## Context

Facilities are viewed from an orbital perspective — the player is looking at
the whole earth, not walking through cities. Individual buildings would be
too small to see. The visual appeal is glowing geometric primitives: dots,
squares, short line segments, and connecting arcs that form a luminous network
across the wireframe globe.

## Decision

Render facilities and transport links as **glowing geometric primitives** using
additive blending and emissive materials. Scale and shape encode facility type
and status.

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

### Transport Links

Transport links between facilities render as **glowing arcs** following
great-circle paths along the globe surface:

- **Arc shape**: Quadratic Bezier curve with control point lifted slightly
  above the surface midpoint, creating a gentle rise over the globe curvature.
- **Color**: Determined by the resource type flowing (iron = steel blue, oil =
  dark amber, water = cyan, electricity = yellow-white, wood = green, etc.).
- **Thickness**: Proportional to transport capacity.
- **Pulse animation**: Animated dashed segments or moving bright dots travel
  along the arc from source to destination, visualizing active resource flow.
  Pulse speed = transport speed. Pulse density = flow rate.
- **Idle links**: Dim/base color when no flow is assigned.

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

### Performance

- Use **instanced meshes** for facility markers: one draw call per shape type,
  per-instance transform for position/scale.
- Transport arcs: batch by color into line segment buffers. Limit active pulse
  count; fade distant pulses.
- Bloom post-processing via Three.js `UnrealBloomPass` (TresJS `TresJS` post-fx
  integration or custom `EffectComposer`).
- Target: 60fps with up to ~500 markers + ~200 transport arcs.

### LOD (Level of Detail)

- **Far zoom** (whole earth visible): Markers as single-pixel points with glow;
  transport arcs as thin lines. Facility type not distinguishable — only
  presence and color.
- **Medium zoom** (continent level): Markers show shape and relative size;
  transport arcs show pulse animation.
- **Close zoom** (region level): Markers show full shape with optional label
  text; transport arcs show flow direction clearly.

## Consequences

**Positive:**
- Glowing primitives on a wireframe globe create the sci-fi command-center
  aesthetic the player wants.
- Shape + color + pulse animation encode a lot of information without text,
  keeping the view clean.
- Instanced rendering + LOD keeps performance acceptable at scale.

**Negative:**
- Bloom post-processing has a performance cost; may need quality settings.
- At extreme zoom-out, all markers converge to a glow blob — LOD must handle
  this gracefully (cluster simplification may be needed for 1000+ markers).
- Color blindness: shape encoding helps, but color is primary — ensure
  shapes are distinguishable independently.

## Alternatives Considered

- **3D building models**: Rejected — at orbital scale they'd be invisible or
  absurdly oversized. Geometric abstraction is the right call.
- **Sprite/textured billboards**: More detail possible but breaks the
  wireframe/holographic aesthetic. Emissive primitives fit better.
- **No LOD (always full detail)**: Would limit game scale to ~100 facilities
  before frame drops. LOD is necessary for the "watch it grow" appeal.