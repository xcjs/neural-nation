# ADR-0002: 3D Earth Visualization

| Field      | Value                        |
| ---------- | ---------------------------- |
| Status     | Proposed                     |
| Date       | 2026-07-08                   |
| Deciders   | Project owner                |
| Relates to | ADR-0008, ADR-0013, ADR-0023 |

## Context

The earth is the central visual element of the game. Players pan/rotate it to
watch their LLM-built civilization grow. The visual style must be "digitally
stylized" — not photorealistic, but evocative of a sci-fi command interface.

## Decision

Use **TresJS** (`@tresjs/core`) with **Three.js** as the underlying renderer to
render a **wireframe/holographic** earth.

### Visual Design

- **Globe**: Wireframe sphere with a translucent ocean layer (subtle blue glow).
  Continents rendered as raised mesh regions with luminous edge outlines.
- **Color palette**: Dark space background; cyan/teal wireframe grid; warm
  accent colors for facilities (gold, orange, green) that pop against the cool
  earth tones.
- **Atmosphere**: Faint radial glow around the globe edge (fresnel shader effect)
  to suggest atmosphere without literal cloud rendering.
- **Lighting**: Minimal ambient + single directional "sun" light to create
  day/night terminator line across the wireframe for spatial orientation.
- **Grid**: Latitude/longitude wireframe lines visible at intervals; clickable
  intersections or region zones for facility placement feedback.

### Interaction

- **Panning**: Mouse drag rotates the globe (orbit controls). Scroll to zoom.
  Touch gestures supported for mobile.
- **Facility markers**: Facilities appear as glowing geometric primitives on the
  globe surface — points, squares, short line segments — scaled by facility
  size/type. Each facility is surrounded by a **particle cloud** of small
  glowing points whose density and motion pattern encode activity level and
  facility type. See ADR-0008 for full detail.
- **Transport lines**: Connections between facilities rendered as glowing arcs
  along the globe surface (great-circle paths) with flowing particle streams
  showing active resource movement. Color indicates resource type flowing.
- **City glow**: Dense facility clusters produce overlapping particle clouds
  that merge into a bright "city glow" — industrialized regions of the earth
  visibly glow brighter than untouched regions.

### Implementation Notes

- Use `@tresjs/core` `<TresCanvas>` as the root 3D component.
- Globe geometry: `IcosahedronGeometry` (high subdivision) for a faceted
  wireframe look, or `SphereGeometry` with wireframe material.
- **Dynamic terrain**: Vertex displacements use **effective** elevation (base
  terrain + per-game modifications, per ADR-0023). When terrain changes via
  terraforming, affected vertices animate to their new positions over ~1-2
  seconds (smooth lerp, not instant pop). Only affected vertices are updated
  — the full geometry is not rebuilt. See ADR-0023 for terraforming visual
  details.
- Custom shaders for the atmosphere glow (fresnel-based rim lighting).
- Facility markers use instanced meshes for performance when hundreds exist.
- Facility **particle clouds** use GPU-driven `Points` with custom
  `ShaderMaterial` — particle motion (orbit, rise, stream, swirl) computed
  in vertex shaders, no CPU per-particle updates. See ADR-0008.
- Transport arcs: quadratic Bezier curves projected onto the sphere surface,
  rendered with additive blending for the glow effect. Flow particles along
  arcs use the same GPU-driven particle approach.
- Frame budget: target 60fps with up to ~500 facility markers + ~200 transport
  lines + ~100K particles on screen.

## Consequences

**Positive:**

- TresJS gives idiomatic Vue composables for Three.js — no imperative escape
  hatches needed for standard operations.
- Wireframe/holographic style is performant (fewer textures/shaders) and
  visually distinctive.
- Glowing aesthetic makes facilities readable at orbital zoom.

**Negative:**

- Custom shaders needed for atmosphere glow, particle cloud motion, and
  transport flow effects.
- **Dynamic terrain mesh** (ADR-0023): vertex updates on terraforming require
  careful buffer management — cannot rebuild the entire geometry per frame.
  Must update only affected vertices and lerp positions for smooth
  transitions.
- Instanced rendering + GPU particle systems add complexity for facility
  markers at scale.

## Alternatives Considered

- **CesiumJS**: Rejected — too heavy for a stylized game globe; oriented toward
  real-world geospatial data with photographic terrain/imagery.
- **Babylon.js**: Capable but less Vue-idiomatic; would require imperative
  scene management outside the Vue reactivity system.
- **Low-poly stylized**: Considered but the wireframe/holographic look better
  supports the "glowing structures" visual goal the player wants.
