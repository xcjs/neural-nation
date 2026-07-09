import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createGameDb, getTemplateDbPath } from '../../db/client'
import { DifficultyConfigs } from '../../../lib/constants/difficulty'
import { DifficultyPreset, type RegistryEntry } from '../../../lib/types/game'
import { generateTokenPair } from './token'
import { addToRegistry, ensureDataDir } from './registry'
import { schema } from '../../db/schema'
import { eq } from 'drizzle-orm'

export interface CreateGameResult {
  token: string
  publicToken: string
  mcpUrl: string
}

export function createGame(difficulty: DifficultyPreset): CreateGameResult {
  const { token, publicToken } = generateTokenPair()

  ensureDataDir()

  const templatePath = getTemplateDbPath()
  if (!existsSync(templatePath)) {
    throw new Error('Template database not found. Run build-template script first.')
  }

  const gameDbPath = resolve('data', 'games', `${token}.db`)
  copyFileSync(templatePath, gameDbPath)

  const db = createGameDb(token)

  const now = new Date().toISOString()

  db.insert(schema.meta).values({
    key: 'game',
    token,
    publicToken,
    createdAt: now,
    lastActiveAt: now,
    lastTickAt: null,
    tickCount: 0,
    status: 'Active',
    difficulty,
    cleanupEligibleAt: null,
  }).run()

  seedStartingResources(db, difficulty)
  seedStartingPopulation(db, difficulty)

  const entry: RegistryEntry = {
    token,
    publicToken,
    createdAt: now,
    lastActive: now,
    status: 'Active' as GameStatus,
    cleanupEligibleAt: null,
  }
  addToRegistry(entry)

  const mcpUrl = buildMcpUrl(token)

  return { token, publicToken, mcpUrl }
}

function buildMcpUrl(token: string): string {
  const host = process.env.HOST || 'localhost'
  const port = process.env.PORT || '3000'
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'

  if (process.env.NODE_ENV === 'production') {
    const domain = process.env.PUBLIC_DOMAIN || 'play.neuralnation.app'
    return `https://${domain}/mcp/sse?token=${token}`
  }

  return `${protocol}://${host}:${port}/mcp/sse?token=${token}`
}

function seedStartingResources(
  db: ReturnType<typeof createGameDb>,
  difficulty: DifficultyPreset,
): void {
  const config = DifficultyConfigs[difficulty]

  for (const resource of config.startingResources) {
    const quantity = randomInRange(resource.min, resource.max)
    db.insert(schema.stockpiles).values({
      resourceKey: resource.resourceKey,
      facilityId: null,
      quantity,
      capacity: quantity * 10,
      unit: resource.unit,
    }).run()
  }
}

function seedStartingPopulation(
  db: ReturnType<typeof createGameDb>,
  difficulty: DifficultyPreset,
): void {
  const config = DifficultyConfigs[difficulty]
  const population = randomInRange(config.populationRange.min, config.populationRange.max)

  db.insert(schema.humanity).values({
    key: 'global',
    population,
    growthRate: 0.0005,
    welfare: 100,
    foodSatisfaction: 100,
    energySatisfaction: 100,
    assignedToSpace: 0,
  }).run()

  db.insert(schema.environment).values({
    key: 'global',
    pollutionLevel: 0,
    forestCoverage: 100,
    waterQuality: 100,
    biodiversity: 100,
  }).run()
}

function randomInRange(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min))
}

export function getGameMeta(token: string) {
  const db = createGameDb(token)
  return db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()
}