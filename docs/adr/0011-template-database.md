# ADR-0011: Template Database for Game Instantiation

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |
| Relates to | ADR-0003, ADR-0005, ADR-0010, ADR-0013, ADR-0018, ADR-0023 |

## Context

Every new game starts with the same set of natural resource deposits seeded
from real geological data (ADR-0003): ~118 elements + bulk resources at
thousands of lat/lon coordinates. Running this seeding process from scratch
for each new game — parsing geological datasets, running noise fill algorithms,
inserting thousands of rows — is expensive and slow. It also creates a risk of
inconsistency between games if the seeding logic changes over time.

Instead, we should pre-build a **template database** containing all the
pre-populated static data (schema + resource deposits) and copy it as the
starting point for each new game.

## Decision

Maintain a **template database** (`data/games/_template.db`) that contains the
full schema and all pre-seeded resource deposit data. New games are created by
**file-copying the template DB** to `data/games/{token}.db`, then running any
pending migrations and inserting game-specific metadata.

### Template Contents

The template DB includes:

- **Full schema**: All tables, indexes, and constraints (created via Drizzle
  migrations — see ADR-0010).
- **Resource deposits**: All `resources` rows — the ~118 elements and bulk
  resources at their real-world lat/lon coordinates, with quantities, grades,
  and depths. All with `discovered = 0` (LLM must survey to discover them).
- **Terrain grid**: All `terrain` rows — the 0.1° × 0.1° elevation grid
  (~840K cells) with elevation, terrain class, and land/ocean flag (ADR-0013).
  Consumed by transport pathfinding and earth visualization.
- **Reference data**: Any static lookup tables (element properties, facility
  type definitions, transport type definitions, biome definitions) that don't
  change per game.
- **Recipes**: All `recipes`, `recipe_inputs`, `recipe_outputs` rows — the
  full recipe graph defining what each facility type can produce and what
  inputs it needs (ADR-0018). Static game data, identical across all games.
- **Tech tree**: All `tech_nodes`, `tech_costs`, `tech_unlocks` rows — the
  full technology tree defining research prerequisites, costs, and unlocks
  (ADR-0018). Static game data. Per-game research progress is stored in the
  `game_research` table (empty in the template).
- **Empty game-state tables**: `facilities`, `transports`, `stockpiles`,
  `event_log`, `survey_log`, `game_research`, `actions`,
  `terrain_modifications` are present but empty — populated during gameplay.
  The `terrain_modifications` table (ADR-0023) is a per-game overlay on the
  base `terrain` table — base terrain is immutable; modifications accumulate
  per game as the agent terraforms.

### Template Build Process

The template DB is built (or rebuilt) via a dev/script command:

```
npm run db:fetch-data    # downloads large geological datasets (if needed)
npm run db:build-template
```

The fetch step (`scripts/fetch-geological-data.ts`, outside the Nuxt project)
downloads large datasets (e.g., hydrological data, large oil/gas datasets)
into `data/geological/`. Small datasets (crustal abundance table, MRDS if
under ~5MB) are bundled in the repo and don't need downloading. The fetch
script is idempotent — it skips datasets already present. See ADR-0003 for
data source details.

The build step:
1. Deletes `data/games/_template.db` if it exists.
2. Creates a fresh DB and runs all Drizzle migrations.
3. Runs the geological data seeding pipeline (ADR-0003): parses USGS data,
   crustal abundance tables, oil/gas data, biome data, and inserts all
   `resources` rows.
4. Runs the terrain seeding pipeline (ADR-0013): parses the downsampled SRTM
   elevation grid, computes terrain classes, and inserts all `terrain` rows.
5. Inserts reference/lookup data.
6. Inserts recipe data (ADR-0018): all recipes, recipe_inputs, recipe_outputs
   rows defining the production graph.
7. Inserts tech tree data (ADR-0018): all tech_nodes, tech_costs, tech_unlocks
   rows defining the research tree.
8. Runs `VACUUM` to compact the file.
9. Logs summary stats (deposit count, element count, terrain cell count,
   recipe count, tech node count, file size).

The template is **committed to the repo** so production deployments don't need
the raw geological datasets at runtime. The geological datasets can remain in
`data/geological/` for development and template rebuilding, but the template DB
itself is the artifact used at runtime.

### New Game Creation Flow

```
1. Player clicks "New Game"
2. Server generates 256-bit token
3. Copy data/games/_template.db → data/games/{token}.db
4. Open {token}.db with Drizzle, run pending migrations (if any since template
   was built)
5. INSERT INTO meta (token, created_at, tick_rate, ...) VALUES (...)
6. Add to registry.json
7. Return full MCP URL to player
```

Step 3 is a file copy — orders of magnitude faster than running the full
seeding pipeline. Game creation is near-instant regardless of deposit count.

### Template Versioning

- A `schema_version` table in the template tracks the migration version it was
  built with.
- When the template is copied for a new game, any migrations newer than the
  template's version are applied automatically. This handles the case where the
  template hasn't been rebuilt after a schema change.
- The template file includes a `_template_meta` table with build timestamp and
  source data version for traceability.

### File Layout

```
scripts/
  fetch-geological-data.ts  ← downloads large datasets (outside Nuxt project)
  build-template.ts         ← builds _template.db from geological data

data/
  geological/               ← raw datasets (bundled small + downloaded large)
    mrds.json                ← bundled (small)
    crustal_abundance.json   ← bundled (small)
    oil_gas.json             ← bundled or downloaded
    biomes.json              ← bundled or downloaded
    hydrology/               ← downloaded (large, gitignored)
    terrain/                 ← downloaded SRTM-derived grid (large, gitignored)
  games/
    _template.db             ← pre-built template (committed to repo)
    {token1}.db              ← per-game DBs (gitignored)
    {token2}.db
    registry.json            ← active games index (gitignored)
```

## Consequences

**Positive:**
- Game creation is a file copy + a few inserts — sub-second regardless of
  deposit count.
- All games start from identical resource data — no inconsistency from
  re-running stochastic seeding.
- The geological seeding pipeline runs only during template builds, not per
  game. Runtime server doesn't need the raw datasets.
- Template can be rebuilt independently when geological data is updated.
- File copy is atomic and reliable on all OSes.

**Negative:**
- Template file can be large (thousands of deposit rows + ~840K terrain cells
  + reference data). Compressable; acceptable for a game artifact.
- Schema changes require template rebuild (or migration-on-copy, which is
  handled by the version check).
- Template file must be kept in sync with schema migrations; a CI step should
  rebuild it when migrations change.

## Alternatives Considered

- **Per-game seeding from scratch**: Too slow (seconds to minutes per game) and
  risks inconsistency. Rejected.
- **Single shared DB with per-game schemas**: Loses the file-per-game isolation
  (ADR-0005). Rejected.
- **Template as SQL dump (not a DB file)**: Slower to apply (parse + execute
  all INSERTs) vs file copy. The binary DB file is faster. SQL dumps could be
  used as a portable fallback format.