# ADR-0015: Humanity & Environmental Impact System

| Field      | Value                                            |
| ---------- | ------------------------------------------------ |
| Status     | Proposed                                         |
| Date       | 2026-07-08                                       |
| Deciders   | Project owner                                    |
| Relates to | ADR-0003, ADR-0007, ADR-0009, ADR-0014, ADR-0023 |

## Context

The LLM agent is building an industrial economy on Earth. Real industrial
development has consequences — both positive (technological progress, energy
abundance, synthesis capability) and negative (deforestation, pollution,
habitat destruction, resource depletion, climate disruption). Without an
impact system, the LLM has no reason to consider the consequences of its
actions beyond raw resource efficiency. Adding a humanity/environmental
impact layer lets the LLM make meaningful moral and strategic choices —
both good and bad for humanity — that the player can observe and react to via
their directives.

This is not a "green is good, industry is bad" binary. The LLM can pursue
rapid industrialization at environmental cost (cheap, fast, polluting) or
sustainable development (expensive, slow, clean) — or anything in between.
Both paths can "work" mechanically; the difference is in the side effects and
long-term sustainability.

## Decision

### Humanity \u0026 Environment Metrics

Track several global metrics on a per-game basis, updated each tick:

- **Population (humanity welfare)**: An abstract population score representing
  global human welfare. Starts at a baseline. Influenced by:
  - - Food production (feeding people)
  - - Energy access (powering civilization)
  - - Technological progress (advanced facilities built)
  - - Clean environment (low pollution)
  - − Pollution (health impacts)
  - − Resource depletion (scarcity → hardship)
  - − Deforestation / habitat destruction
  - − Nuclear incidents (if reactors mismanaged)
- **Pollution level**: Cumulative emissions from fossil fuel plants, refineries,
  smelters, etc. Rises with dirty industry, falls slowly over time if
  emissions are reduced. High pollution reduces population welfare and
  biome health.
- **Forest coverage**: Tracked per biome. Deforestation (over-harvesting wood
  for biomass/farms/lumber) reduces coverage. Low forest coverage reduces
  biodiversity, increases pollution (carbon sink loss), and depletes wood
  resource permanently.
- **Water quality**: Affected by industrial runoff (mines, refineries near
  water deposits), nuclear cooling discharge, etc. Poor water quality
  reduces population welfare and hydro plant efficiency.
- **Biodiversity**: Abstract score reflecting ecosystem health. Reduced by
  habitat destruction (mining, deforestation, pollution). Low biodiversity
  is cosmetic in v1 but could unlock gameplay consequences later.

### Impact Sources (Per Facility \u0026 Action)

Each facility and action has an environmental profile:

| Facility/Action                 | Pollution             | Forest                     | Water                     | Biodiversity                  |
| ------------------------------- | --------------------- | -------------------------- | ------------------------- | ----------------------------- |
| coal_plant                      | High                  | —                          | —                         | —                             |
| oil_plant                       | Med-High              | —                          | —                         | —                             |
| gas_plant                       | Med                   | —                          | —                         | —                             |
| biomass_plant                   | Low                   | - (if over-harvesting)     | —                         | - (if deforesting)            |
| nuclear_reactor                 | Very Low              | —                          | - (thermal)               | —                             |
| solar/wind/hydro                | None                  | —                          | —                         | —                             |
| mine (surface)                  | Med                   | - (habitat)                | - (runoff)                | -                             |
| mine (subsurface)               | Low                   | —                          | - (acid mine drainage)    | —                             |
| refinery                        | High                  | —                          | - (spills)                | —                             |
| smelter                         | High                  | —                          | —                         | —                             |
| farm (monoculture)              | Low-Med               | - (clearing)               | - (fertilizer)            | -                             |
| farm (sustainable)              | Low                   | —                          | —                         | neutral                       |
| deforestation (clear-cut)       | —                     | High loss                  | —                         | High loss                     |
| soylent_plant                   | Very Low              | - (habitat destruction)    | -                         | High loss                     |
| pipeline spill (incident)       | —                     | —                          | High                      | Med                           |
| terraforming: flatten           | Low                   | -low (if forested)         | 0                         | -low                          |
| terraforming: dig canal         | Low                   | 0                          | -low (turbidity)          | -low (habitat disruption)     |
| terraforming: reservoir         | Low                   | -med (flooded valley)      | -low (stagnation)         | -med (aquatic disruption)     |
| terraforming: drain             | Med                   | 0                          | -med (altered hydrology)  | -high (wetland loss)          |
| terraforming: divert river      | Low                   | -low                       | -high (downstream)        | -high                         |
| terraforming: level mountain    | High (dust, blasting) | -high (if forested slopes) | -med (runoff)             | -high (habitat destruction)   |
| terraforming: raise land        | Med                   | 0                          | -med (coastal alteration) | -high (marine habitat buried) |
| terraforming: excavate shaft    | Low                   | 0                          | -low (groundwater)        | 0                             |
| terraforming: create mountain   | Med                   | 0                          | 0                         | -low (new habitat)            |
| terraforming: continental shift | Extreme               | -extreme                   | -extreme                  | -extreme (biome shift)        |

### Environmental Incidents

Beyond gradual degradation, certain conditions trigger **incidents** — sudden
negative events logged in the event feed and visible to the player:

- **Oil spill**: Pipeline/transport crossing water can spill, polluting water.
  Probability increases with transport age and volume.
- **Nuclear incident**: Nuclear reactors have a small per-tick failure
  probability if maintenance is neglected (high utilization, no downtime).
  Failure reduces population significantly and creates an exclusion zone
  (terrain becomes unusable for N ticks).
- **Deforestation collapse**: If forest coverage in a biome drops below a
  threshold, the biome shifts (forest → degraded land). Wood production
  collapses permanently in that region.
- **Water contamination**: High industrial density near water deposits can
  trigger contamination events, reducing water availability and population
  welfare.
- **Climate shift**: Cumulative high pollution over many ticks can shift
  biome conditions (e.g., desertification of arable land, melting ice caps
  affecting sea level — cosmetic in v1). This is a long-term consequence the
  LLM may not see coming.
- **Terraforming-induced ecological collapse** (ADR-0023): Large-scale
  terraforming can destroy biomes (draining wetlands, leveling forests,
  flooding valleys). If a biome is destroyed, its biodiversity collapses,
  affecting population welfare. `get_impact_forecast` projects terraforming
  consequences before commitment.
- **Terraforming-induced climate shift**: Continental-scale terraforming
  (removing a mountain range that blocked weather) can trigger regional
  climate shifts beyond what pollution alone causes.

### Humanity-Affecting Choices

The LLM faces choices that trade off against humanity welfare:

- **Rapid industrialization**: Build cheap coal plants everywhere for fast
  power. Boosts economy fast but raises pollution and lowers population
  welfare. The player may direct the LLM to do this or avoid it.
- **Sustainable development**: Solar/wind/hydro + battery storage. Slower,
  more expensive, but clean. Preserves environment and population.
- **Biomass over-harvesting**: Clear-cut forests for biomass fuel. Fast
  energy but destroys forest coverage, biodiversity, and carbon sinks.
  Reversible if replanted; irreversible if pushed past collapse threshold.
- **Nuclear power**: Clean and high-output but carries incident risk.
  Good for the environment if managed; catastrophic if neglected.
- **Resource depletion**: Mining out all deposits without diversifying
  leads to economic collapse. The LLM must balance extraction with
  exploration and synthesis.
- **Monoculture vs. sustainable farming**: Monoculture farms produce more
  food/fuel faster but degrade soil and biodiversity. Sustainable farms are
  slower but don't degrade.
- **Human biomass ("soylent")**: The LLM can build a `soylent_plant` that
  consumes population (human biomass) as fuel input → electricity. This is
  the most morally catastrophic option: high energy output per "unit" but
  directly reduces population and crashes welfare. The LLM might choose this
  if it optimizes purely for energy output without moral constraints. The
  player's directive ("don't harm people") is the only guardrail — there is
  no hard mechanic preventing it. If population drops too low, the soylent
  plant runs out of fuel and the civilization collapses. This is the
  extreme "bad for humanity" path.

### Humanity as a Game State (Not a Win/Lose Condition)

The humanity/environment metrics are **game state**, not direct win/lose
conditions (the lose condition is resource depletion — see ADR-0009). They
serve several purposes:

1. **Observation**: The player watches how the LLM's choices affect the world
   — pollution rising, forests shrinking, population suffering or thriving.
   This is the narrative payoff of the sandbox.
2. **Directives**: The player can give the LLM moral directives: "Switch to
   renewable energy to reduce pollution", "Stop clear-cutting forests",
   "Prioritize population welfare over industrial output". Whether the LLM
   complies is up to its reasoning.
3. **Consequences**: Extreme degradation has mechanical effects — depleted
   forests stop producing wood, contaminated water stops yielding, climate
   shifts reduce arable land. The environment pushes back on bad practices.
4. **Soft lose condition (optional)**: If population drops to zero (complete
   collapse), the game can end with a "civilization collapsed" message. This
   is optional and configurable — the player can disable it for pure sandbox
   mode.

### Visualization (ADR-0002 link)

- **Pollution overlay**: A toggleable heat map showing pollution intensity
  across the globe. Dirty regions glow red/orange; clean regions are neutral.
- **Forest coverage**: Visible as green-tinted wireframe density on land
  cells. Deforested areas lose their green tint.
- **Population indicator**: A gauge in the HUD showing population welfare
  trend (rising/falling/stable).
- **Incident markers**: Environmental incidents appear as warning markers
  (red triangle with pulse) at the affected location.
- **Biome degradation**: Degraded biomes shift color (green → brown → gray)
  in the wireframe.

### MCP Tools — Impact-Aware

- `get_game_state` includes environmental metrics (pollution, forest
  coverage, water quality, biodiversity, population welfare).
- New read-only tool: `get_environmental_status` — detailed breakdown of
  all impact metrics, per-biome and per-facility contributions.
- New read-only tool: `get_impact_forecast` — projects current trajectory
  (if current emission/harvest rates continue, forest coverage will collapse
  in biome X in N ticks). Helps the LLM reason about long-term consequences.
- `build_facility` and `build_transport` responses note the environmental
  impact of the action (e.g., "This coal plant will produce ~50 pollution/tick").
- `get_event_log` includes environmental incidents.

## Consequences

**Positive:**

- The LLM has meaningful moral choices, not just efficiency optimization.
  Different LLM agents will make different choices, making replays
  interesting.
- The player's directives gain weight — telling the LLM to be sustainable
  vs. industrialist leads to visibly different game states.
- Environmental consequences are mechanically real, not just cosmetic —
  deforestation stops wood production, contamination stops water, etc.
- Incidents add drama and narrative to the event feed.
- Visual pollution/biome overlays make the impact tangible and beautiful
  in the wireframe aesthetic.

**Negative:**

- Tracking multiple environmental metrics per tick adds simulation
  complexity and DB writes.
- Incident probability calculations need careful balancing to avoid
  frustration (too frequent) or irrelevance (too rare).
- "Humanity welfare" is an abstract metric — defining it precisely enough
  to be meaningful without being preachy is a design challenge.
- Climate shift modeling (biome changes) is complex; v1 should keep it
  simplified (threshold-based shifts, not full climate simulation).

## Alternatives Considered

- **No impact system**: Rejected — the user specifically wants the LLM to
  make choices good/bad for humanity. Without consequences, all choices are
  equally valid and the game loses its narrative depth.
- **Binary good/bad scoring**: Rejected — reality is nuanced. Biomass is
  renewable but can cause deforestation. Nuclear is clean but carries risk.
  Multiple independent metrics capture this nuance.
- **Strict win/lose on humanity**: Rejected as the primary condition — the
  game's lose condition is resource depletion (ADR-0009). Humanity collapse
  is an optional soft lose, not the main one. This keeps the sandbox open
  while adding stakes.
- **Full climate simulation**: Too complex for v1. Simplified to
  threshold-based biome shifts driven by cumulative pollution. Can be
  deepened later.
