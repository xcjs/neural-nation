import { createGameDb, type GameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { eq, sql } from 'drizzle-orm'
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

  const growthAmount = Math.floor(human.population * human.growthRate)
  const newPopulation = Math.max(0, human.population + growthAmount)

  db.update(schema.humanity)
    .set({ population: newPopulation })
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

  const pollutionDelta = activeFacilities.length * 0.01

  db.update(schema.environment)
    .set({
      pollutionLevel: Math.max(0, env.pollutionLevel + pollutionDelta),
    })
    .where(eq(schema.environment.key, 'global'))
    .run()
}

function processFacilityProduction(db: GameDb, _tick: number): void {
  // Stub: facility production logic will be expanded in later iteration
  // For now, update throughput for active facilities
  const activeFacilities = db.select()
    .from(schema.facilities)
    .where(eq(schema.facilities.status, 'Active'))
    .all()

  for (const facility of activeFacilities) {
    db.update(schema.facilities)
      .set({ throughput: facility.targetOutputRate })
      .where(eq(schema.facilities.id, facility.id))
      .run()
  }
}

function processTransportFlows(_db: GameDb, _tick: number): void {
  // Stub: transport flow processing
  // Will move resources along transport links based on flow rates
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
  if (nonEmptyStockpiles.length === 0) {
    const activeFacilities = db.select()
      .from(schema.facilities)
      .where(eq(schema.facilities.status, 'Active'))
      .all()

    if (activeFacilities.length === 0) {
      return true
    }
  }

  return false
}