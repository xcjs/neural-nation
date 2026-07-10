# ADR-0016: Space-Based Resource Gathering

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Status     | Proposed                               |
| Date       | 2026-07-08                             |
| Deciders   | Project owner                          |
| Relates to | ADR-0003, ADR-0007, ADR-0014, ADR-0015 |

## Context

Earth's resources are finite. Non-renewable deposits (coal, oil, uranium,
metals) will eventually be depleted by sustained extraction. Without an
alternative source, the game inevitably ends in resource exhaustion regardless
of the LLM's skill. Real civilization faces this same horizon — and the real
answer is space: asteroid mining, lunar extraction, and eventually deeper
space resource harvesting. This gives the LLM a long-term progression path:
build the infrastructure to reach space before Earth runs out.

ADR-0007 included a `spaceport` facility as a "future expansion hook." This ADR
makes it real: a full space-based resource gathering tier that the LLM can
unlock by building the necessary infrastructure.

## Decision

### Prerequisites: The Space Infrastructure Chain

Space resource gathering requires a **chain of advanced facilities** that the
LLM must build in sequence. Each tier unlocks the next:

**Tier 3a — Launch Capability:**

- `spaceport` — Launch facility. Required to send payloads to orbit. Must be
  built on land near the equator (launch advantage — equatorial sites get
  Earth's rotational boost). Construction requires significant resources
  (steel, electronics, fuel, advanced components). Consumes fuel per launch.
- `rocket_assembly` — Factory that builds launch vehicles from metals,
  fuel, and electronics. Must be connected to the spaceport via transport.
  Each rocket has a construction cost and is consumed on launch (expendable)
  or recovered (reusable, higher tech, cheaper per launch long-term).

**Tier 3b — Orbital Infrastructure:**

- `space_station` — Orbital platform. Acts as the staging point for
  space-based operations. Must be launched in pieces (multiple rocket
  launches) and assembled in orbit. Houses crew (population assigned), power
  generation (solar panels — no atmosphere so high efficiency), and docking
  for space vehicles.
- `orbital_refinery` — Processes raw space materials (asteroid ore) into
  usable resources in orbit. Avoids the cost of returning raw ore to Earth
  surface — only refined materials (much lighter) are sent back down.

**Tier 3c — Space Resource Extraction:**

- `asteroid_mining_drone` — Autonomous mining craft sent from the space
  station to near-Earth asteroids. Extracts elements (especially rare
  metals: platinum-group, iridium, rare earths) and returns ore to the
  orbital refinery. Each drone has a round-trip time (many ticks) and a
  payload capacity.
- `lunar_mine` — Mining facility on the Moon. Extracts helium-3 (for
  fusion reactors — ADR-0014), aluminum, titanium, and other lunar
  resources. Requires regular transport runs between Moon and space station.
  Higher initial cost but permanent (not consumed like drones).
- `deep_space_probe` — (Tier 3d, endgame) Sent to asteroid belts or
  gas giants for exotic resources. Very long round-trip times but unlocks
  the rarest materials (helium-3 from gas giants, deuterium, exotic isotopes).

### Space Resources

Space sources provide resources that may be depleted or rare on Earth:

| Source               | Resources                                                     | Notes                                                                          |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Near-Earth asteroids | Platinum-group metals, rare earths, iron, nickel, water (ice) | Most asteroids are metal/ice rich; water ice can be returned for fuel/hydrogen |
| Moon                 | Helium-3, aluminum, titanium, silicon, oxygen                 | Helium-3 is critical for fusion reactors (ADR-0014)                            |
| Asteroid belt        | Everything in larger quantities, longer travel time           | Belt probes take many ticks round-trip                                         |
| Gas giants           | Helium-3, hydrogen, deuterium                                 | Requires deep-space capability; very long round-trips                          |
| Comets               | Water ice, organic compounds, volatiles                       | Irregular availability (per-tick probability of a comet passing)               |

Space resources are **unlimited in aggregate** (the solar system is vast) but
**rate-limited** by the number of mining drones, launch capacity, and orbital
infrastructure the LLM has built. This means the LLM can't "run out" once it
has space capability — but it can't instantly replace Earth production either.
The transition from Earth-based to space-based economy is gradual and requires
planning ahead before depletion hits.

### Transport: Earth ↔ Space

Moving resources between Earth surface and orbit is expensive:

- **Launch cost**: Each launch consumes fuel proportional to payload mass.
  Expendable rockets are consumed; reusable rockets (higher tech) have lower
  per-launch cost but higher initial investment.
- **Return cost**: Returning materials to Earth surface requires a
  heat-shielded descent capsule. Cheaper than launch (no fuel needed for
  descent — gravity does the work) but still requires infrastructure
  (landing pad at or near spaceport).
- **Orbital transport**: Moving resources between space station, orbital
  refinery, and mining drones is "free" in fuel (zero-g, electric propulsion)
  but takes ticks (travel time).

The LLM must decide what to return to Earth (refined metals, helium-3) vs.
what to keep in orbit (construction materials for expanding space
infrastructure). This creates a logistics loop: space infrastructure
expansion needs materials, which need to come from either Earth launches
(expensive) or space mining (requires existing infrastructure to be
productive enough). Bootstrapping is the challenge.

### Space \u0026 Population

- `space_station` requires **crew** (population assigned from Earth's
  population pool). Crew assigned to space are removed from the Earth
  population count but still consume food/water (sent via supply launches).
  If supply launches stop, space crew die (population loss).
- Population assigned to space can grow slowly (space-born population) but
  at a lower rate than Earth population (limited habitat space).
- If the LLM builds `space_habitat` (advanced orbital colony), larger
  populations can live in orbit. This is the path to a "post-Earth"
  civilization if Earth becomes uninhabitable (environmental collapse,
  ADR-0015).

### MCP Tools — Space-Aware

- `build_facility` with space facility types. Space facilities require their
  prerequisites (e.g., `space_station` requires `spaceport` to exist first;
  `asteroid_mining_drone` requires `space_station`).
- New tool: `launch_mission` — sends a rocket from `spaceport` to orbit with
  a payload (crew, supplies, drone, or orbital construction materials).
  Returns estimated arrival tick.
- New tool: `assign_space_crew` — moves population from Earth pool to a
  space facility (space_station, lunar_mine). Reduces Earth population,
  increases space facility operational capacity.
- `get_game_state` includes space infrastructure summary (launches pending,
  orbital facilities, active mining drones, space resource flows).
- New read-only tool: `get_space_status` — full space operation overview
  (available targets, drone status, resource flows, launch schedule).

### Visualization (ADR-0002 link)

- **Spaceport**: Large star-shaped marker with launch trajectory arcs (glowing
  lines shooting upward from the surface). Active launches show animated
  ascending pulses.
- **Space layer**: When the player zooms out beyond the earth, an orbital view
  appears showing space stations, mining drones, and lunar facilities as
  small glowing markers in orbital paths around the earth. Drones show
  trajectory lines to their target asteroids and back.
- **Return arcs**: Resources returning to Earth show as descending glowing
  arcs from orbit to the spaceport — a visual mirror of launch arcs.
- **Moon**: Optionally rendered as a smaller sphere in the orbital view, with
  lunar mine markers on its surface.

## Consequences

**Positive:**

- Gives the game a long-term progression arc: Earth depletion → space
  infrastructure → space-based economy. The LLM must plan ahead.
- Space resources are unlimited but rate-limited, creating a sustainable
  endgame without removing the challenge.
- Helium-3 from the Moon unlocks fusion reactors (ADR-0014), tying space
  gathering to the power system.
- Space crew / population creates a "post-Earth" survival path if the
  environment collapses (ADR-0015).
- Visually spectacular: orbital view, launch/return arcs, lunar surface
  extend the wireframe aesthetic beyond the earth.

**Negative:**

- Significant complexity: new facility types, transport model, orbital
  visualization, crew management. This is a large feature — should be
  implemented after the core Earth-based game is working.
- Orbital rendering extends the Three.js scene beyond the earth sphere;
  camera/frustum management for the orbital view adds complexity.
- Bootstrapping the space economy is a chicken-and-egg problem: need
  infrastructure to mine, need materials for infrastructure. The LLM may
  need many ticks of Earth-based investment before space becomes productive.
  This is intentional (progression) but could frustrate if the LLM starts
  too late.
- Population assigned to space reduces Earth workforce, creating a trade-off
  between space expansion and Earth production capacity.

## Alternatives Considered

- **No space gathering (Earth-only)**: Rejected — the user specifically wants
  space-based gathering when Earth resources deplete. Without it, every game
  inevitably ends in resource exhaustion.
- **Instant teleport to space (no launch infrastructure)**: Rejected — the
  user wants proper space travel facilities to be a prerequisite. The
  challenge of building the space chain is the gameplay.
- **Unlimited Earth resources (no depletion)**: Rejected — resource depletion
  is a core mechanic (ADR-0009 lose condition). Space gathering is the
  solution to depletion, not a replacement for it.
- **Space as a separate game mode**: Rejected — space gathering should emerge
  naturally from the Earth-based game as the LLM builds toward it. It's an
  extension of the same simulation, not a separate experience.
