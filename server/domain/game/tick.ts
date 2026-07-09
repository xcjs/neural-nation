import { createGameDb, type GameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { GameStatus } from '../../../lib/types/game'

export interface TickResult {
  tickCount: number
  status: GameStatus
  advanced: boolean
}

export function processTick(token: string): TickResult {
  const db = createGameDb(token)
  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()

  if (!meta) {
    throw new Error('Game not found')
  }

  if (meta.status === GameStatus.GameOver || meta.status === GameStatus.Paused) {
    return {
      tickCount: meta.tickCount ?? 0,
      status: meta.status as GameStatus,
      advanced: false,
    }
  }

  const newTick = (meta.tickCount ?? 0) + 1
  const now = new Date().toISOString()

  db.transaction((tx) => {
    tx.update(schema.meta)
      .set({
        tickCount: newTick,
        lastTickAt: now,
        lastActiveAt: now,
      })
      .where(eq(schema.meta.key, 'game'))
      .run()

    processResourceRegeneration(tx, newTick)
    processPopulationUpdate(tx, newTick)
    processEnvironmentUpdate(tx, newTick)
    processConstructionProgress(tx, newTick)
    processFacilityProduction(tx, newTick)
    processTransportFlows(tx, newTick)
    processResearchProgress(tx, newTick)

    if (checkLoseCondition(tx)) {
      tx.update(schema.meta)
        .set({ status: GameStatus.GameOver })
        .where(eq(schema.meta.key, 'game'))
        .run()
    }
  })

  const updatedMeta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()

  return {
    tickCount: newTick,
    status: (updatedMeta?.status as GameStatus) || GameStatus.Active,
    advanced: true,
  }
}

function processResourceRegeneration(db: GameDb, _tick: number): void {
  db.update(schema.resources)
    .set({
      remaining: sql`${schema.resources.remaining} + ${schema.resources.remaining} * 0.0001`,
    })
    .where(
      sql`${schema.resources.surface} = 1 AND ${schema.resources.remaining} < ${schema.resources.quantity}`,
    )
    .run()
}

function processPopulationUpdate(db: GameDb, _tick: number): void {
  const human = db.select().from(schema.humanity).where(eq(schema.humanity.key, 'global')).get()
  if (!human) return

  const env = db.select().from(schema.environment).where(eq(schema.environment.key, 'global')).get()

  // Logistic growth modulated by environmental conditions
  let effectiveGrowthRate = human.growthRate

  if (env) {
    // High pollution reduces growth
    if (env.pollutionLevel > 60) effectiveGrowthRate *= 0.5
    else if (env.pollutionLevel > 30) effectiveGrowthRate *= 0.8

    // Low forest/biodiversity reduces growth (habitat degradation)
    const habitatHealth = (env.forestCoverage + env.biodiversity) * 0.5
    if (habitatHealth < 30) effectiveGrowthRate *= 0.7

    // Poor water quality reduces growth
    if (env.waterQuality < 30) effectiveGrowthRate *= 0.6

    // Death spiral: if population is already low and environment is bad, population declines
    if (env.pollutionLevel > 80 && human.population < 100) {
      effectiveGrowthRate = -Math.abs(human.growthRate) * 2
    }
  }

  const growthAmount = Math.floor(human.population * effectiveGrowthRate)
  const newPopulation = Math.max(0, human.population + growthAmount)

  // Update welfare based on environment
  let welfare = human.welfare
  if (env) {
    const envScore = (100 - env.pollutionLevel + env.forestCoverage + env.waterQuality + env.biodiversity) / 4
    welfare = Math.round(human.welfare * 0.9 + envScore * 0.1)
  }

  db.update(schema.humanity)
    .set({ population: newPopulation, welfare })
    .where(eq(schema.humanity.key, 'global'))
    .run()
}

function processEnvironmentUpdate(db: GameDb, _tick: number): void {
  const env = db.select().from(schema.environment).where(eq(schema.environment.key, 'global')).get()
  if (!env) return

  const activeFacilities = db.select()
    .from(schema.facilities)
    .where(eq(schema.facilities.status, 'Active'))
    .all()

  let pollutionDelta = 0
  let forestDelta = 0
  let waterDelta = 0
  let biodiversityDelta = 0

  for (const facility of activeFacilities) {
    const impact = FACILITY_IMPACT[facility.type]
    if (!impact) continue

    pollutionDelta += impact.pollution
    forestDelta += impact.forest
    waterDelta += impact.water
    biodiversityDelta += impact.biodiversity

    // Nuclear incident probability: 0.01% per tick per reactor
    if ((facility.type === 'NuclearReactor' || facility.type === 'BreederReactor') && facility.throughput > 0) {
      if (Math.random() < 0.0001) {
        logIncident(db, _tick, 'nuclear_incident', `Nuclear incident at ${facility.name} (id=${facility.id})`, 'critical', facility.id)
        pollutionDelta += 5
        waterDelta -= 2
        biodiversityDelta -= 1
      }
    }
  }

  // Natural recovery: forests and biodiversity slowly regenerate if pollution is low
  if (env.pollutionLevel < 30) {
    forestDelta += 0.005
    biodiversityDelta += 0.003
  }

  // High pollution damages forest and biodiversity (carbon sink loss feedback)
  if (env.pollutionLevel > 60) {
    forestDelta -= 0.01
    biodiversityDelta -= 0.005
  }

  // Water quality degrades from high pollution
  if (env.pollutionLevel > 50) {
    waterDelta -= 0.005
  }

  const newPollution = Math.max(0, Math.min(100, env.pollutionLevel + pollutionDelta))
  const newForest = Math.max(0, Math.min(100, env.forestCoverage + forestDelta))
  const newWater = Math.max(0, Math.min(100, env.waterQuality + waterDelta))
  const newBiodiversity = Math.max(0, Math.min(100, env.biodiversity + biodiversityDelta))

  db.update(schema.environment)
    .set({
      pollutionLevel: newPollution,
      forestCoverage: newForest,
      waterQuality: newWater,
      biodiversity: newBiodiversity,
    })
    .where(eq(schema.environment.key, 'global'))
    .run()

  // Check for deforestation collapse
  if (env.forestCoverage > 20 && newForest <= 20) {
    logIncident(db, _tick, 'deforestation_collapse', 'Forest coverage has collapsed below 20% — biome degradation accelerating', 'warning')
  }

  // Check for water contamination
  if (env.waterQuality > 30 && newWater <= 30) {
    logIncident(db, _tick, 'water_contamination', 'Water quality has dropped below 30% — contamination spreading', 'warning')
  }

  // Check for climate shift
  if (env.pollutionLevel < 80 && newPollution >= 80) {
    logIncident(db, _tick, 'climate_shift', 'Pollution has reached critical levels — climate shift imminent', 'critical')
  }
}

const FACILITY_IMPACT: Record<string, { pollution: number; forest: number; water: number; biodiversity: number }> = {
  CoalPlant: { pollution: 0.1, forest: 0, water: 0, biodiversity: 0 },
  OilPlant: { pollution: 0.07, forest: 0, water: 0, biodiversity: 0 },
  GasPlant: { pollution: 0.04, forest: 0, water: 0, biodiversity: 0 },
  DieselGenerator: { pollution: 0.05, forest: 0, water: 0, biodiversity: 0 },
  BiomassPlant: { pollution: 0.02, forest: -0.01, water: 0, biodiversity: -0.005 },
  BiogasPlant: { pollution: 0.01, forest: 0, water: 0, biodiversity: 0 },
  NuclearReactor: { pollution: 0.002, forest: 0, water: -0.003, biodiversity: 0 },
  BreederReactor: { pollution: 0.002, forest: 0, water: -0.003, biodiversity: 0 },
  FusionReactor: { pollution: 0, forest: 0, water: 0, biodiversity: 0 },
  SolarFarm: { pollution: 0, forest: 0, water: 0, biodiversity: 0 },
  WindFarm: { pollution: 0, forest: 0, water: 0, biodiversity: 0 },
  HydroPlant: { pollution: 0, forest: -0.002, water: -0.002, biodiversity: -0.002 },
  GeothermalPlant: { pollution: 0.005, forest: 0, water: -0.001, biodiversity: 0 },
  EthanolRefinery: { pollution: 0.02, forest: 0, water: -0.002, biodiversity: 0 },
  SoylentPlant: { pollution: 0.005, forest: -0.005, water: -0.003, biodiversity: -0.01 },
  Extractor: { pollution: 0.03, forest: -0.005, water: -0.005, biodiversity: -0.005 },
  Farm: { pollution: 0.015, forest: -0.003, water: -0.003, biodiversity: -0.005 },
  Forestry: { pollution: 0.01, forest: -0.02, water: 0, biodiversity: -0.01 },
  WaterPump: { pollution: 0.005, forest: 0, water: -0.002, biodiversity: 0 },
  Smelter: { pollution: 0.06, forest: 0, water: 0, biodiversity: 0 },
  Refinery: { pollution: 0.07, forest: 0, water: -0.005, biodiversity: 0 },
  Processor: { pollution: 0.04, forest: 0, water: -0.002, biodiversity: 0 },
  ChemicalPlant: { pollution: 0.05, forest: 0, water: -0.005, biodiversity: -0.002 },
  Factory: { pollution: 0.04, forest: 0, water: -0.002, biodiversity: -0.002 },
  AdvancedFactory: { pollution: 0.03, forest: 0, water: -0.001, biodiversity: -0.001 },
  Excavator: { pollution: 0.03, forest: -0.01, water: -0.005, biodiversity: -0.01 },
  Dredger: { pollution: 0.02, forest: 0, water: -0.01, biodiversity: -0.01 },
  Terraformer: { pollution: 0.05, forest: -0.02, water: -0.01, biodiversity: -0.02 },
  PlanetaryEngine: { pollution: 0.1, forest: -0.05, water: -0.05, biodiversity: -0.05 },
}

function logIncident(db: GameDb, tick: number, type: string, message: string, severity: string, facilityId: number | null = null): void {
  db.insert(schema.incidents).values({
    type,
    severity,
    description: message,
    tickTriggered: tick,
    tickResolved: null,
  }).run()

  db.insert(schema.events).values({
    tick,
    timestamp: new Date().toISOString(),
    type,
    message,
    severity,
    facilityId,
    data: null,
  }).run()
}

const EXTRACTOR_TYPES = new Set(['Extractor', 'Farm', 'Forestry', 'WaterPump', 'Excavator', 'Dredger'])
const POWER_GENERATING_TYPES = new Set([
  'PowerPlant', 'SolarFarm', 'WindFarm', 'HydroPlant', 'NuclearReactor',
  'BreederReactor', 'FusionReactor', 'BiomassPlant', 'BiogasPlant',
  'DieselGenerator', 'CoalPlant', 'GasPlant', 'OilPlant', 'GeothermalPlant',
])
const DEFAULT_BUFFER_CAPACITY = 100
const STORAGE_BUFFER_CAPACITY = 1000
const EXTRACTOR_RANGE_DEG = 2

const CONSTRUCTION_TIMES: Record<string, number> = {
  Extractor: 2, Farm: 2, Forestry: 2, WaterPump: 2,
  Processor: 3, Smelter: 3, Refinery: 3,
  Factory: 4, AdvancedFactory: 5, ChemicalPlant: 4,
  ResearchLab: 4,
  PowerPlant: 3, SolarFarm: 2, WindFarm: 2, HydroPlant: 5, NuclearReactor: 8,
  BreederReactor: 10, FusionReactor: 15,
  BiomassPlant: 3, BiogasPlant: 3, EthanolRefinery: 4, SoylentPlant: 4,
  DieselGenerator: 2, CoalPlant: 3, GasPlant: 3, OilPlant: 3, GeothermalPlant: 5,
  Storage: 2, BatteryBank: 3,
  Spaceport: 10, RocketAssembly: 8, SpaceStation: 15, OrbitalRefinery: 12,
  LunarMine: 12, DeepSpaceProbe: 15, SpaceHabitat: 20,
  Excavator: 4, Dredger: 4, Terraformer: 10, PlanetaryEngine: 20,
}
const DEFAULT_CONSTRUCTION_TIME = 3

function processConstructionProgress(db: GameDb, _tick: number): void {
  const underConstruction = db.select()
    .from(schema.facilities)
    .where(eq(schema.facilities.status, 'UnderConstruction'))
    .all()

  for (const facility of underConstruction) {
    const totalTime = CONSTRUCTION_TIMES[facility.type] ?? DEFAULT_CONSTRUCTION_TIME
    const newProgress = facility.constructionProgress + 1

    if (newProgress >= totalTime) {
      db.update(schema.facilities)
        .set({ constructionProgress: totalTime, status: 'Active' })
        .where(eq(schema.facilities.id, facility.id))
        .run()
    } else {
      db.update(schema.facilities)
        .set({ constructionProgress: newProgress })
        .where(eq(schema.facilities.id, facility.id))
        .run()
    }
  }
}

function processFacilityProduction(db: GameDb, _tick: number): void {
  const activeFacilities = db.select()
    .from(schema.facilities)
    .where(eq(schema.facilities.status, 'Active'))
    .all()

  for (const facility of activeFacilities) {
    // Power check: unpowered facilities produce nothing.
    // Extractors and power-generating facilities are exempt (extractors run on
    // their own diesel/fuel; generators are self-powered by definition).
    const isExtractor = EXTRACTOR_TYPES.has(facility.type)
    const isPowerGenerator = POWER_GENERATING_TYPES.has(facility.type)
    if (!facility.powerConnected && !isExtractor && !isPowerGenerator) {
      db.update(schema.facilities)
        .set({ throughput: 0 })
        .where(eq(schema.facilities.id, facility.id))
        .run()
      continue
    }

    if (isExtractor) {
      processExtractorProduction(db, facility)
    } else if (facility.activeRecipeId) {
      processRecipeProduction(db, facility)
    } else {
      db.update(schema.facilities)
        .set({ throughput: 0 })
        .where(eq(schema.facilities.id, facility.id))
        .run()
    }
  }
}

function processExtractorProduction(db: GameDb, facility: typeof schema.facilities.$inferSelect): void {
  const rate = facility.targetOutputRate || 1

  // Find nearest discovered deposit within range
  const deposit = db.select().from(schema.resources)
    .where(
      and(
        sql`${schema.resources.discovered} = 1`,
        sql`${schema.resources.remaining} > 0`,
        sql`abs(${schema.resources.lat} - ${facility.lat}) <= ${EXTRACTOR_RANGE_DEG}`,
        sql`abs(${schema.resources.lon} - ${facility.lon}) <= ${EXTRACTOR_RANGE_DEG}`,
      ),
    )
    .all()
    .sort((a, b) => {
      const da = Math.sqrt((a.lat - facility.lat) ** 2 + (a.lon - facility.lon) ** 2)
      const db2 = Math.sqrt((b.lat - facility.lat) ** 2 + (b.lon - facility.lon) ** 2)
      return da - db2
    })[0]

  if (!deposit) {
    db.update(schema.facilities)
      .set({ throughput: 0 })
      .where(eq(schema.facilities.id, facility.id))
      .run()
    return
  }

  const extractAmount = Math.min(rate, deposit.remaining)
  if (extractAmount <= 0) return

  // Check output buffer capacity
  const outputBuffer = getOrCreateBuffer(db, facility.id, deposit.resourceKey, 'output', facility.type === 'Storage' ? STORAGE_BUFFER_CAPACITY : DEFAULT_BUFFER_CAPACITY, deposit.unit)
  const spaceRemaining = outputBuffer.capacity - outputBuffer.quantity
  const actualExtract = Math.min(extractAmount, spaceRemaining)

  if (actualExtract <= 0) {
    // Output buffer full — extraction halts (overflow)
    db.update(schema.facilities)
      .set({ throughput: 0 })
      .where(eq(schema.facilities.id, facility.id))
      .run()
    return
  }

  // Deplete deposit
  db.update(schema.resources)
    .set({ remaining: deposit.remaining - actualExtract })
    .where(eq(schema.resources.id, deposit.id))
    .run()

  // Fill output buffer
  db.update(schema.facilityBuffers)
    .set({ quantity: outputBuffer.quantity + actualExtract })
    .where(eq(schema.facilityBuffers.id, outputBuffer.id))
    .run()

  db.update(schema.facilities)
    .set({ throughput: actualExtract })
    .where(eq(schema.facilities.id, facility.id))
    .run()
}

function processRecipeProduction(db: GameDb, facility: typeof schema.facilities.$inferSelect): void {
  const recipeId = facility.activeRecipeId!

  const inputs = db.select().from(schema.recipeInputs)
    .where(eq(schema.recipeInputs.recipeId, recipeId))
    .all()
  const outputs = db.select().from(schema.recipeOutputs)
    .where(eq(schema.recipeOutputs.recipeId, recipeId))
    .all()

  if (outputs.length === 0) return

  // Determine production cycles this tick based on target rate and craft time
  const rate = facility.targetOutputRate || 1
  const cycles = rate / (1) // 1 cycle per tick at rate 1; scaled by targetOutputRate

  // Check all required (non-optional) inputs are available in input buffers
  let canProduce = true
  const inputConsumption: Array<{ buffer: typeof schema.facilityBuffers.$inferSelect, amount: number }> = []

  for (const input of inputs) {
    if (input.optional) continue

    const buffer = getOrCreateBuffer(db, facility.id, input.resourceKey, 'input', DEFAULT_BUFFER_CAPACITY, input.unit)
    const needed = input.quantity * cycles

    if (buffer.quantity < needed) {
      canProduce = false
      break
    }
    inputConsumption.push({ buffer, amount: needed })
  }

  if (!canProduce) {
    db.update(schema.facilities)
      .set({ throughput: 0 })
      .where(eq(schema.facilities.id, facility.id))
      .run()
    return
  }

  // Check output buffers have space
  const outputProduction: Array<{ buffer: typeof schema.facilityBuffers.$inferSelect, amount: number }> = []
  for (const output of outputs) {
    const buffer = getOrCreateBuffer(db, facility.id, output.resourceKey, 'output', facility.type === 'Storage' ? STORAGE_BUFFER_CAPACITY : DEFAULT_BUFFER_CAPACITY, output.unit)
    const spaceRemaining = buffer.capacity - buffer.quantity
    const produced = output.quantity * cycles

    if (produced > spaceRemaining) {
      // Overflow — production halts
      canProduce = false
      break
    }
    outputProduction.push({ buffer, amount: produced })
  }

  if (!canProduce) {
    db.update(schema.facilities)
      .set({ throughput: 0 })
      .where(eq(schema.facilities.id, facility.id))
      .run()
    return
  }

  // Consume inputs
  for (const { buffer, amount } of inputConsumption) {
    db.update(schema.facilityBuffers)
      .set({ quantity: buffer.quantity - amount })
      .where(eq(schema.facilityBuffers.id, buffer.id))
      .run()
  }

  // Produce outputs
  for (const { buffer, amount } of outputProduction) {
    db.update(schema.facilityBuffers)
      .set({ quantity: buffer.quantity + amount })
      .where(eq(schema.facilityBuffers.id, buffer.id))
      .run()
  }

  // Update throughput (sum of outputs produced)
  const totalOutput = outputProduction.reduce((sum, o) => sum + o.amount, 0)
  db.update(schema.facilities)
    .set({ throughput: totalOutput })
    .where(eq(schema.facilities.id, facility.id))
    .run()
}

function getOrCreateBuffer(
  db: GameDb,
  facilityId: number,
  resourceKey: string,
  direction: 'input' | 'output',
  capacity: number,
  unit: string,
): typeof schema.facilityBuffers.$inferSelect {
  const existing = db.select().from(schema.facilityBuffers)
    .where(
      and(
        eq(schema.facilityBuffers.facilityId, facilityId),
        eq(schema.facilityBuffers.resourceKey, resourceKey),
        eq(schema.facilityBuffers.direction, direction),
      ),
    )
    .get()

  if (existing) return existing

  return db.insert(schema.facilityBuffers).values({
    facilityId,
    resourceKey,
    quantity: 0,
    capacity,
    unit,
    direction,
  }).returning().get()
}

function processTransportFlows(db: GameDb, _tick: number): void {
  const transports = db.select().from(schema.transports)
    .where(sql`${schema.transports.flowRate} > 0`)
    .all()

  for (const transport of transports) {
    if (!transport.resourceKey) continue

    // Source: from facility's output buffer
    const sourceBuffer = db.select().from(schema.facilityBuffers)
      .where(
        and(
          eq(schema.facilityBuffers.facilityId, transport.fromFacilityId),
          eq(schema.facilityBuffers.resourceKey, transport.resourceKey),
          eq(schema.facilityBuffers.direction, 'output'),
        ),
      )
      .get()

    if (!sourceBuffer || sourceBuffer.quantity <= 0) continue

    // Destination: to facility's input buffer (create if needed)
    const destBuffer = getOrCreateBuffer(db, transport.toFacilityId, transport.resourceKey, 'input', DEFAULT_BUFFER_CAPACITY, sourceBuffer.unit)

    const destSpace = destBuffer.capacity - destBuffer.quantity
    const flowAmount = Math.min(transport.flowRate, sourceBuffer.quantity, destSpace)

    if (flowAmount <= 0) continue

    // Drain source output buffer
    db.update(schema.facilityBuffers)
      .set({ quantity: sourceBuffer.quantity - flowAmount })
      .where(eq(schema.facilityBuffers.id, sourceBuffer.id))
      .run()

    // Fill destination input buffer
    db.update(schema.facilityBuffers)
      .set({ quantity: destBuffer.quantity + flowAmount })
      .where(eq(schema.facilityBuffers.id, destBuffer.id))
      .run()
  }
}

function processResearchProgress(db: GameDb, _tick: number): void {
  // Stub: advance research progress for active labs
  const activeResearch = db.select()
    .from(schema.gameResearch)
    .where(eq(schema.gameResearch.status, 'InProgress'))
    .all()

  for (const research of activeResearch) {
    const newProgress = research.progress + 1
    const techNode = db.select()
      .from(schema.techNodes)
      .where(eq(schema.techNodes.id, research.techId))
      .get()

    if (techNode && newProgress >= techNode.researchTime) {
      db.update(schema.gameResearch)
        .set({
          status: 'Completed',
          progress: newProgress,
          completedAtTick: _tick,
        })
        .where(eq(schema.gameResearch.id, research.id))
        .run()
    } else {
      db.update(schema.gameResearch)
        .set({ progress: newProgress })
        .where(eq(schema.gameResearch.id, research.id))
        .run()
    }
  }
}

function checkLoseCondition(db: GameDb): boolean {
  const stockpiles = db.select().from(schema.stockpiles).all()

  if (stockpiles.length === 0) {
    return true
  }

  const nonEmptyStockpiles = stockpiles.filter((s) => s.quantity > 0)
  const activeFacilities = db.select()
    .from(schema.facilities)
    .where(eq(schema.facilities.status, 'Active'))
    .all()

  if (nonEmptyStockpiles.length === 0 && activeFacilities.length === 0) {
    return true
  }

  // Population collapse (ADR-0009): if population drops to 0, game over
  const humanity = db.select().from(schema.humanity)
    .where(eq(schema.humanity.key, 'global'))
    .get()
  if (humanity && humanity.population <= 0) {
    return true
  }

  // Complete depletion: all non-renewable deposits exhausted AND no stockpiles AND no active production
  if (nonEmptyStockpiles.length === 0 && activeFacilities.length > 0) {
    const nonRenewableDeposits = db.select().from(schema.resources)
      .where(
        and(
          eq(schema.resources.category, 'NonRenewable'),
          sql`${schema.resources.remaining} > 0`,
        ),
      )
      .all()

    const renewableResources = db.select().from(schema.resources)
      .where(
        and(
          eq(schema.resources.category, 'Renewable'),
          sql`${schema.resources.remaining} > 0`,
        ),
      )
      .all()

    const extractingFacilities = activeFacilities.filter((f) =>
      EXTRACTOR_TYPES.has(f.type),
    )

    if (nonRenewableDeposits.length === 0 && renewableResources.length === 0 && extractingFacilities.length > 0) {
      return true
    }
  }

  return false
}