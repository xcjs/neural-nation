import { mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const dataDir = join(root, 'data', 'games')
const templatePath = join(dataDir, '_template.db')

async function main() {
  mkdirSync(dataDir, { recursive: true })

  if (existsSync(templatePath)) {
    console.log('Template DB already exists, skipping. Delete it to rebuild.')
    return
  }

  console.log('Building template database...')

  // Create empty SQLite file for the template
  const Database = (await import('better-sqlite3')).default
  const db = new Database(templatePath)

  // Enable WAL mode
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Create all tables (matches server/db/schema/)
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      token TEXT,
      public_token TEXT,
      created_at TEXT,
      last_active_at TEXT,
      last_tick_at TEXT,
      tick_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Active',
      difficulty TEXT,
      cleanup_eligible_at TEXT
    );

    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_key TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      lat REAL,
      lon REAL,
      quantity REAL,
      remaining REAL,
      grade REAL,
      discovered INTEGER DEFAULT 0,
      surface INTEGER DEFAULT 0,
      depth REAL,
      unit TEXT DEFAULT 't'
    );

    CREATE TABLE IF NOT EXISTS stockpiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_key TEXT NOT NULL,
      facility_id INTEGER,
      quantity REAL DEFAULT 0,
      capacity REAL,
      unit TEXT DEFAULT 't'
    );

    CREATE TABLE IF NOT EXISTS survey_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick INTEGER,
      timestamp TEXT,
      lat REAL,
      lon REAL,
      radius REAL,
      deposits_found INTEGER
    );

    CREATE TABLE IF NOT EXISTS facilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT,
      lat REAL,
      lon REAL,
      status TEXT DEFAULT 'UnderConstruction',
      tech_required TEXT,
      active_recipe_id TEXT,
      target_output_rate REAL DEFAULT 0,
      power_consumption REAL DEFAULT 0,
      power_connected INTEGER DEFAULT 0,
      throughput REAL DEFAULT 0,
      construction_progress REAL DEFAULT 0,
      elevation REAL,
      terrain_class TEXT,
      created_at_tick INTEGER
    );

    CREATE TABLE IF NOT EXISTS facility_buffers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER NOT NULL,
      resource_key TEXT NOT NULL,
      quantity REAL DEFAULT 0,
      capacity REAL,
      unit TEXT DEFAULT 't',
      direction TEXT DEFAULT 'input'
    );

    CREATE TABLE IF NOT EXISTS transports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      from_facility_id INTEGER,
      to_facility_id INTEGER,
      from_lat REAL,
      from_lon REAL,
      to_lat REAL,
      to_lon REAL,
      flow_rate REAL DEFAULT 0,
      resource_key TEXT,
      capacity REAL,
      terrain_modifiers TEXT,
      created_at_tick INTEGER
    );

    CREATE TABLE IF NOT EXISTS terrain (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat_index INTEGER NOT NULL,
      lon_index INTEGER NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      elevation REAL NOT NULL,
      terrain_class TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS terrain_modifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat_index INTEGER NOT NULL,
      lon_index INTEGER NOT NULL,
      elevation_delta REAL,
      new_terrain_class TEXT,
      modified_by TEXT,
      modified_at_tick INTEGER,
      operation_id TEXT,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS power_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_facility_id INTEGER,
      to_facility_id INTEGER,
      capacity REAL,
      load REAL DEFAULT 0,
      transmission_loss REAL DEFAULT 0,
      created_at_tick INTEGER
    );

    CREATE TABLE IF NOT EXISTS battery_banks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER,
      stored REAL DEFAULT 0,
      capacity REAL
    );

    CREATE TABLE IF NOT EXISTS humanity (
      key TEXT PRIMARY KEY,
      population REAL DEFAULT 0,
      growth_rate REAL DEFAULT 0.0005,
      welfare REAL DEFAULT 100,
      food_satisfaction REAL DEFAULT 100,
      energy_satisfaction REAL DEFAULT 100,
      assigned_to_space REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS environment (
      key TEXT PRIMARY KEY,
      pollution_level REAL DEFAULT 0,
      forest_coverage REAL DEFAULT 100,
      water_quality REAL DEFAULT 100,
      biodiversity REAL DEFAULT 100
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      severity TEXT,
      description TEXT,
      lat REAL,
      lon REAL,
      tick_triggered INTEGER,
      tick_resolved INTEGER
    );

    CREATE TABLE IF NOT EXISTS space_facilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT,
      status TEXT DEFAULT 'Planning',
      crew_assigned INTEGER DEFAULT 0,
      crew_capacity INTEGER,
      orbital INTEGER DEFAULT 1,
      created_at_tick INTEGER
    );

    CREATE TABLE IF NOT EXISTS space_missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      status TEXT,
      target TEXT,
      launch_tick INTEGER,
      return_tick INTEGER,
      payload TEXT,
      facility_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick INTEGER,
      timestamp TEXT,
      tool_name TEXT,
      arguments TEXT,
      result_status TEXT,
      result_data TEXT,
      impact_tags TEXT,
      state_snapshot TEXT
    );

    CREATE TABLE IF NOT EXISTS event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick INTEGER,
      timestamp TEXT,
      type TEXT,
      message TEXT,
      severity TEXT DEFAULT 'info',
      facility_id INTEGER,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      facility_type TEXT NOT NULL,
      craft_time INTEGER DEFAULT 1,
      tech_required TEXT
    );

    CREATE TABLE IF NOT EXISTS recipe_inputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id TEXT NOT NULL,
      resource_key TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT DEFAULT 't',
      optional INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS recipe_outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id TEXT NOT NULL,
      resource_key TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT DEFAULT 't'
    );

    CREATE TABLE IF NOT EXISTS tech_nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      tier INTEGER DEFAULT 1,
      category TEXT NOT NULL,
      research_time INTEGER DEFAULT 10
    );

    CREATE TABLE IF NOT EXISTS tech_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tech_id TEXT NOT NULL,
      resource_key TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT DEFAULT 't'
    );

    CREATE TABLE IF NOT EXISTS tech_unlocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tech_id TEXT NOT NULL,
      unlock_type TEXT NOT NULL,
      unlock_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tech_prerequisites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tech_id TEXT NOT NULL,
      prerequisite_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_research (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tech_id TEXT NOT NULL,
      status TEXT DEFAULT 'Locked',
      progress REAL DEFAULT 0,
      started_at_tick INTEGER,
      completed_at_tick INTEGER,
      lab_facility_id INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_resources_key ON resources(resource_key);
    CREATE INDEX IF NOT EXISTS idx_resources_discovered ON resources(discovered);
    CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type);
    CREATE INDEX IF NOT EXISTS idx_facilities_status ON facilities(status);
    CREATE INDEX IF NOT EXISTS idx_terrain_coords ON terrain(lat_index, lon_index);
    CREATE INDEX IF NOT EXISTS idx_event_log_tick ON event_log(tick);
    CREATE INDEX IF NOT EXISTS idx_actions_tick ON actions(tick);
  `)

  // Seed reference data: periodic table elements as resource rows
  const { NATURALLY_OCCURRING_ELEMENTS } = await import('../lib/constants/elements')
  const insertResource = db.prepare(`
    INSERT INTO resources (resource_key, name, category, quantity, remaining, discovered, unit)
    VALUES (?, ?, 'Element', 0, 0, 0, 't')
  `)
  for (const [symbol, data] of Object.entries(NATURALLY_OCCURRING_ELEMENTS)) {
    insertResource.run(symbol.toLowerCase(), data.name)
  }

  // Seed tech tree (basic nodes)
  const insertTech = db.prepare(`INSERT OR IGNORE INTO tech_nodes (id, name, description, tier, category, research_time) VALUES (?, ?, ?, ?, ?, ?)`)
  insertTech.run('basic_construction', 'Basic Construction', 'Unlock basic facility construction', 1, 'Metallurgy', 5)
  insertTech.run('earthworks', 'Earthworks', 'Unlock basic terraforming', 1, 'Terraforming', 5)
  insertTech.run('metallurgy_1', 'Basic Metallurgy', 'Unlock smelting', 1, 'Metallurgy', 10)
  insertTech.run('precision_manufacturing', 'Precision Manufacturing', 'Unlock advanced factories and research labs', 2, 'Metallurgy', 20)
  insertTech.run('hydraulic_engineering', 'Hydraulic Engineering', 'Unlock water management terraforming', 2, 'Terraforming', 15)
  insertTech.run('advanced_terraforming', 'Advanced Terraforming', 'Unlock large-scale terraforming', 3, 'Terraforming', 30)
  insertTech.run('nuclear_power', 'Nuclear Power', 'Unlock nuclear reactors', 2, 'Power', 20)
  insertTech.run('aerospace_engineering', 'Aerospace Engineering', 'Unlock spaceport', 2, 'Space', 25)
  insertTech.run('planetary_engineering', 'Planetary Engineering', 'Unlock continental terraforming', 4, 'Terraforming', 50)
  insertTech.run('fusion_power', 'Fusion Power', 'Unlock fusion reactor', 3, 'Power', 40)

  // Chemistry branch
  insertTech.run('industrial_chemistry', 'Industrial Chemistry', 'Unlock chemical processing', 2, 'Chemistry', 15)
  insertTech.run('advanced_materials', 'Advanced Materials', 'Unlock alloys and composites', 3, 'Chemistry', 25)
  insertTech.run('biotechnology', 'Biotechnology', 'Unlock biofuel and fertilizer production', 2, 'Chemistry', 20)

  // Seed tech prerequisites (tier progression)
  const insertPrereq = db.prepare(`INSERT OR IGNORE INTO tech_prerequisites (tech_id, prerequisite_id) VALUES (?, ?)`)
  insertPrereq.run('precision_manufacturing', 'metallurgy_1')
  insertPrereq.run('hydraulic_engineering', 'earthworks')
  insertPrereq.run('advanced_terraforming', 'hydraulic_engineering')
  insertPrereq.run('nuclear_power', 'precision_manufacturing')
  insertPrereq.run('aerospace_engineering', 'precision_manufacturing')
  insertPrereq.run('planetary_engineering', 'advanced_terraforming')
  insertPrereq.run('fusion_power', 'nuclear_power')
  insertPrereq.run('industrial_chemistry', 'basic_construction')
  insertPrereq.run('advanced_materials', 'industrial_chemistry')
  insertPrereq.run('advanced_materials', 'precision_manufacturing')
  insertPrereq.run('biotechnology', 'industrial_chemistry')

  // Seed tech costs (research consumes resources)
  const insertTechCost = db.prepare(`INSERT OR IGNORE INTO tech_costs (tech_id, resource_key, quantity, unit) VALUES (?, ?, ?, ?)`)
  insertTechCost.run('metallurgy_1', 'iron', 5, 't')
  insertTechCost.run('precision_manufacturing', 'machinery', 2, 't')
  insertTechCost.run('precision_manufacturing', 'steel', 5, 't')
  insertTechCost.run('nuclear_power', 'electronics', 2, 't')
  insertTechCost.run('nuclear_power', 'machinery', 3, 't')
  insertTechCost.run('fusion_power', 'electronics', 5, 't')
  insertTechCost.run('fusion_power', 'machinery', 5, 't')
  insertTechCost.run('aerospace_engineering', 'electronics', 3, 't')
  insertTechCost.run('aerospace_engineering', 'machinery', 3, 't')
  insertTechCost.run('industrial_chemistry', 'plastics', 5, 't')
  insertTechCost.run('advanced_materials', 'electronics', 3, 't')
  insertTechCost.run('advanced_materials', 'machinery', 2, 't')
  insertTechCost.run('biotechnology', 'plastics', 3, 't')

  // Seed tech unlocks (which tech unlocks which recipes/facility types)
  const insertUnlock = db.prepare(`INSERT OR IGNORE INTO tech_unlocks (tech_id, unlock_type, unlock_id) VALUES (?, ?, ?)`)
  insertUnlock.run('metallurgy_1', 'recipe', 'iron_smelting')
  insertUnlock.run('metallurgy_1', 'recipe', 'copper_smelting')
  insertUnlock.run('metallurgy_1', 'recipe', 'steel_making')
  insertUnlock.run('metallurgy_1', 'recipe', 'aluminum_smelting')
  insertUnlock.run('metallurgy_1', 'recipe', 'silicon_extraction')
  insertUnlock.run('precision_manufacturing', 'facility', 'AdvancedFactory')
  insertUnlock.run('precision_manufacturing', 'facility', 'ResearchLab')
  insertUnlock.run('precision_manufacturing', 'recipe', 'machinery')
  insertUnlock.run('precision_manufacturing', 'recipe', 'electronics')
  insertUnlock.run('basic_construction', 'recipe', 'plastics')
  insertUnlock.run('basic_construction', 'recipe', 'fuel_refining')
  insertUnlock.run('basic_construction', 'recipe', 'concrete')
  insertUnlock.run('basic_construction', 'recipe', 'lumber')
  insertUnlock.run('nuclear_power', 'facility', 'NuclearReactor')
  insertUnlock.run('nuclear_power', 'facility', 'BreederReactor')
  insertUnlock.run('fusion_power', 'facility', 'FusionReactor')
  insertUnlock.run('aerospace_engineering', 'facility', 'Spaceport')
  insertUnlock.run('aerospace_engineering', 'facility', 'RocketAssembly')
  insertUnlock.run('aerospace_engineering', 'facility', 'SpaceStation')
  insertUnlock.run('industrial_chemistry', 'recipe', 'chemicals')
  insertUnlock.run('industrial_chemistry', 'recipe', 'fertilizer')
  insertUnlock.run('advanced_materials', 'recipe', 'alloys')
  insertUnlock.run('advanced_materials', 'recipe', 'composites')
  insertUnlock.run('biotechnology', 'recipe', 'biofuel')
  insertUnlock.run('biotechnology', 'recipe', 'ethanol')

  // Seed basic recipes
  const insertRecipe = db.prepare(`INSERT OR IGNORE INTO recipes (id, name, facility_type, craft_time, tech_required) VALUES (?, ?, ?, ?, ?)`)
  insertRecipe.run('iron_smelting', 'Iron Smelting', 'Smelter', 2, 'metallurgy_1')
  insertRecipe.run('copper_smelting', 'Copper Smelting', 'Smelter', 2, 'metallurgy_1')
  insertRecipe.run('steel_making', 'Steel Making', 'Smelter', 3, 'metallurgy_1')
  insertRecipe.run('aluminum_smelting', 'Aluminum Smelting', 'Smelter', 3, 'metallurgy_1')
  insertRecipe.run('silicon_extraction', 'Silicon Extraction', 'Smelter', 3, 'metallurgy_1')
  insertRecipe.run('machinery', 'Machinery', 'Factory', 5, 'precision_manufacturing')
  insertRecipe.run('electronics', 'Electronics', 'Factory', 5, 'precision_manufacturing')
  insertRecipe.run('plastics', 'Plastics', 'ChemicalPlant', 3, 'basic_construction')
  insertRecipe.run('fuel_refining', 'Fuel Refining', 'Refinery', 3, 'basic_construction')
  insertRecipe.run('concrete', 'Concrete', 'Processor', 2, 'basic_construction')
  insertRecipe.run('lumber', 'Lumber', 'Forestry', 2, null)
  insertRecipe.run('chemicals', 'Industrial Chemicals', 'ChemicalPlant', 3, 'industrial_chemistry')
  insertRecipe.run('fertilizer', 'Fertilizer', 'ChemicalPlant', 3, 'biotechnology')
  insertRecipe.run('biofuel', 'Biofuel', 'ChemicalPlant', 4, 'biotechnology')
  insertRecipe.run('ethanol', 'Ethanol', 'EthanolRefinery', 3, 'biotechnology')
  insertRecipe.run('alloys', 'Advanced Alloys', 'AdvancedFactory', 5, 'advanced_materials')
  insertRecipe.run('composites', 'Composite Materials', 'AdvancedFactory', 5, 'advanced_materials')

  // Seed recipe inputs/outputs — enriched with multi-component inputs per ADR-0018
  const insertInput = db.prepare(`INSERT INTO recipe_inputs (recipe_id, resource_key, quantity, unit, optional) VALUES (?, ?, ?, ?, ?)`)
  const insertOutput = db.prepare(`INSERT INTO recipe_outputs (recipe_id, resource_key, quantity, unit) VALUES (?, ?, ?, ?)`)
  // iron_smelting: iron ore + coal (fuel)
  insertInput.run('iron_smelting', 'fe', 2, 't', 0)
  insertInput.run('iron_smelting', 'c', 0.5, 't', 0)
  insertOutput.run('iron_smelting', 'iron', 1, 't')
  // copper_smelting: copper ore + coal
  insertInput.run('copper_smelting', 'cu', 2, 't', 0)
  insertInput.run('copper_smelting', 'c', 0.3, 't', 0)
  insertOutput.run('copper_smelting', 'copper', 1, 't')
  // steel_making: iron + coal + limestone (flux)
  insertInput.run('steel_making', 'fe', 3, 't', 0)
  insertInput.run('steel_making', 'c', 0.5, 't', 0)
  insertInput.run('steel_making', 'ca', 0.2, 't', 1)
  insertOutput.run('steel_making', 'steel', 2, 't')
  // aluminum_smelting: bauxite + coal
  insertInput.run('aluminum_smelting', 'al', 2, 't', 0)
  insertInput.run('aluminum_smelting', 'c', 0.5, 't', 0)
  insertOutput.run('aluminum_smelting', 'aluminum', 1, 't')
  // silicon_extraction: quartz/silicon ore
  insertInput.run('silicon_extraction', 'si', 2, 't', 0)
  insertOutput.run('silicon_extraction', 'silicon', 1, 't')
  // machinery: iron + copper + steel + electronics
  insertInput.run('machinery', 'iron', 2, 't', 0)
  insertInput.run('machinery', 'copper', 1, 't', 0)
  insertInput.run('machinery', 'steel', 1, 't', 0)
  insertInput.run('machinery', 'electronics', 0.5, 't', 1)
  insertOutput.run('machinery', 'machinery', 1, 't')
  // electronics: copper + silicon + gold (optional) + plastics
  insertInput.run('electronics', 'copper', 1, 't', 0)
  insertInput.run('electronics', 'silicon', 1, 't', 0)
  insertInput.run('electronics', 'au', 0.1, 't', 1)
  insertInput.run('electronics', 'plastics', 0.2, 't', 0)
  insertOutput.run('electronics', 'electronics', 1, 't')
  // plastics: oil
  insertInput.run('plastics', 'oil', 1, 't', 0)
  insertOutput.run('plastics', 'plastics', 1, 't')
  // fuel_refining: oil
  insertInput.run('fuel_refining', 'oil', 2, 't', 0)
  insertOutput.run('fuel_refining', 'fuel', 1, 't')
  // concrete: stone + sand
  insertInput.run('concrete', 'stone', 2, 't', 0)
  insertInput.run('concrete', 'sand', 1, 't', 0)
  insertOutput.run('concrete', 'concrete', 2, 't')
  // lumber: wood (renewable)
  insertInput.run('lumber', 'wood', 2, 't', 0)
  insertOutput.run('lumber', 'lumber', 1, 't')
  // chemicals: oil + water
  insertInput.run('chemicals', 'oil', 1, 't', 0)
  insertInput.run('chemicals', 'water', 1, 't', 0)
  insertOutput.run('chemicals', 'chemicals', 1, 't')
  // fertilizer: chemicals + biomass
  insertInput.run('fertilizer', 'chemicals', 1, 't', 0)
  insertInput.run('fertilizer', 'biomass', 1, 't', 1)
  insertOutput.run('fertilizer', 'fertilizer', 1, 't')
  // biofuel: biomass + water
  insertInput.run('biofuel', 'biomass', 2, 't', 0)
  insertInput.run('biofuel', 'water', 1, 't', 0)
  insertOutput.run('biofuel', 'biofuel', 1, 't')
  // ethanol: biomass
  insertInput.run('ethanol', 'biomass', 2, 't', 0)
  insertOutput.run('ethanol', 'ethanol', 1, 't')
  // alloys: steel + aluminum + silicon
  insertInput.run('alloys', 'steel', 2, 't', 0)
  insertInput.run('alloys', 'aluminum', 1, 't', 0)
  insertInput.run('alloys', 'silicon', 0.5, 't', 1)
  insertOutput.run('alloys', 'alloys', 1, 't')
  // composites: plastics + machinery + chemicals
  insertInput.run('composites', 'plastics', 2, 't', 0)
  insertInput.run('composites', 'machinery', 0.5, 't', 0)
  insertInput.run('composites', 'chemicals', 0.5, 't', 1)
  insertOutput.run('composites', 'composites', 1, 't')

  // Seed terrain grid (deterministic value-noise, 1° resolution).
  // Idempotent — no-ops if terrain table already populated.
  console.log('Seeding terrain grid...')
  const { seedTerrainGrid } = await import('./lib/terrain-seed')
  const terrainResult = seedTerrainGrid(db)
  console.log(`Terrain: ${terrainResult.insertedCells} cells @ ${terrainResult.resolution}° resolution`)

  // Seed real resource deposits from USGS MRDS (if the zip is present).
  // Idempotent — no-ops if resources already seeded or zip missing.
  console.log('Seeding MRDS deposits...')
  const { seedMrdsDeposits } = await import('./lib/mrds-seed')
  const mrdsZipPath = join(root, 'data', 'geological', 'raw', 'mrds.csv.zip')
  const mrdsResult = seedMrdsDeposits(db, mrdsZipPath)
  console.log(`MRDS: ${mrdsResult.insertedRows} deposits inserted (${mrdsResult.skippedRows} skipped, ${mrdsResult.totalRows} total rows)`)
  if (mrdsResult.unmappedCommodities.size > 0) {
    console.log(`MRDS unmapped commodities: ${[...mrdsResult.unmappedCommodities].sort().join(', ')}`)
  }

  // VACUUM
  db.exec('VACUUM;')

  // Template meta
  db.prepare(`INSERT OR IGNORE INTO meta (key, status) VALUES ('_template', 'Template')`).run()

  db.close()
  console.log('Template DB built at:', templatePath)
}

main().catch(console.error)