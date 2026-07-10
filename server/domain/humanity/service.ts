import type { EnvironmentalIncident, EnvironmentState, PopulationState } from '../../../lib/types/humanity'
import type { PaginatedResult, PaginationParams } from '../../../lib/types/mcp'
import { eq, sql } from 'drizzle-orm'
import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'

export function getEnvironmentalStatus(token: string): { population: PopulationState, environment: EnvironmentState } {
  const db = createGameDb(token)

  const human = db.select().from(schema.humanity).where(eq(schema.humanity.key, 'global')).get()
  const env = db.select().from(schema.environment).where(eq(schema.environment.key, 'global')).get()

  if (!human || !env) {
    throw new Error('Humanity/environment state not found')
  }

  return {
    population: {
      count: human.population,
      growthRate: human.growthRate,
      welfare: human.welfare,
      foodSatisfaction: human.foodSatisfaction,
      energySatisfaction: human.energySatisfaction,
      assignedToSpace: human.assignedToSpace,
      trend: 'stable',
    },
    environment: {
      population: {
        count: human.population,
        growthRate: human.growthRate,
        welfare: human.welfare,
        foodSatisfaction: human.foodSatisfaction,
        energySatisfaction: human.energySatisfaction,
        assignedToSpace: human.assignedToSpace,
        trend: 'stable',
      },
      pollutionLevel: env.pollutionLevel,
      forestCoverage: env.forestCoverage,
      waterQuality: env.waterQuality,
      biodiversity: env.biodiversity,
      pollutionTrend: 'stable',
      forestTrend: 'stable',
      waterTrend: 'stable',
      biodiversityTrend: 'stable',
      activeIncidents: [],
    },
  }
}

export function getImpactForecast(token: string): { trajectory: string[], warnings: string[] } {
  const db = createGameDb(token)

  const env = db.select().from(schema.environment).where(eq(schema.environment.key, 'global')).get()
  const human = db.select().from(schema.humanity).where(eq(schema.humanity.key, 'global')).get()

  if (!env || !human) {
    return { trajectory: [], warnings: ['Unable to load state'] }
  }

  const trajectory: string[] = []
  const warnings: string[] = []

  if (env.pollutionLevel > 50) {
    trajectory.push('Pollution critical - biodiversity collapse imminent')
    warnings.push('biodiversity_loss')
  }
  if (env.forestCoverage < 30) {
    trajectory.push('Forest coverage critical - ecosystem collapse risk')
    warnings.push('deforestation_collapse')
  }
  if (human.foodSatisfaction < 50) {
    trajectory.push('Food shortage - population decline expected')
    warnings.push('famine')
  }
  if (human.population < 100) {
    trajectory.push('Population critical - civilization collapse risk')
    warnings.push('population_collapse')
  }

  if (trajectory.length === 0) {
    trajectory.push('Stable - no immediate concerns')
  }

  return { trajectory, warnings }
}

export function getIncidents(
  token: string,
  params: PaginationParams = {},
): PaginatedResult<EnvironmentalIncident> {
  const db = createGameDb(token)
  const limit = params.limit || 25
  const offset = params.offset || 0

  const items = db.select().from(schema.incidents).limit(limit).offset(offset).all()
  const totalCount = db.select({ count: sql<number>`count(*)` })
    .from(schema.incidents)
    .get()
    ?.count || 0

  return {
    items: items as unknown as EnvironmentalIncident[],
    totalCount,
    limit,
    offset,
    hasMore: offset + items.length < totalCount,
  }
}
