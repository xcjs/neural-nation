import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { TechTreeNode, TechStatus, Recipe } from '../../../lib/types/tech'
import { TechBranch } from '../../../lib/types/tech'
import type { PaginationParams, PaginatedResult } from '../../../lib/types/mcp'

export function getTechTree(token: string): TechTreeNode[] {
  const db = createGameDb(token)

  const nodes = db.select().from(schema.techNodes).all()
  const research = db.select().from(schema.gameResearch).all()

  return nodes.map((node) => {
    const researchEntry = research.find((r) => r.techId === node.id)
    let status: TechStatus = 'Available'

    if (researchEntry?.status === 'Completed') {
      status = 'Completed'
    } else if (researchEntry?.status === 'InProgress') {
      status = 'InProgress'
    }

    return {
      id: node.id,
      name: node.name,
      description: node.description,
      tier: node.tier,
      category: node.category as TechBranch,
      researchTime: node.researchTime,
      status,
      progress: researchEntry?.progress || 0,
    }
  })
}

export function getRecipes(
  token: string,
  params: {
    facilityType?: string
    techRequired?: string
    unlockedOnly?: boolean
    limit?: number
    offset?: number
  } = {},
): PaginatedResult<Recipe> {
  const db = createGameDb(token)
  const limit = params.limit || 50
  const offset = params.offset || 0

  const conditions = []
  if (params.facilityType) {
    conditions.push(eq(schema.recipes.facilityType, params.facilityType))
  }
  if (params.techRequired) {
    conditions.push(eq(schema.recipes.techRequired, params.techRequired))
  }

  let queryBuilder = db.select().from(schema.recipes).$dynamic()
  if (conditions.length > 0) {
    queryBuilder = queryBuilder.where(and(...conditions))
  }

  const recipeRows = queryBuilder.limit(limit).offset(offset).all()
  const totalCount = db.select({ count: sql<number>`count(*)` })
    .from(schema.recipes)
    .get()?.count || 0

  const recipes: Recipe[] = recipeRows.map((row) => ({
    id: row.id,
    name: row.name,
    facilityType: row.facilityType,
    craftTime: row.craftTime,
    techRequired: row.techRequired,
  }))

  if (params.unlockedOnly) {
    const completedTech = db.select().from(schema.gameResearch)
      .where(eq(schema.gameResearch.status, 'Completed'))
      .all()
      .map((r) => r.techId)

    const filtered = recipes.filter((r) => !r.techRequired || completedTech.includes(r.techRequired))
    return {
      items: filtered,
      totalCount: filtered.length,
      limit,
      offset,
      hasMore: false,
    }
  }

  return {
    items: recipes,
    totalCount,
    limit,
    offset,
    hasMore: offset + recipes.length < totalCount,
  }
}

export function startResearch(
  token: string,
  techNodeId: string,
  labFacilityId: number,
): { success: boolean; researchId: number } {
  const db = createGameDb(token)

  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()
  const tick = meta?.tickCount || 0

  const existing = db.select().from(schema.gameResearch)
    .where(eq(schema.gameResearch.techId, techNodeId))
    .get()

  if (existing) {
    throw new Error(`Research already started for ${techNodeId}`)
  }

  const research = db.insert(schema.gameResearch).values({
    techId: techNodeId,
    status: 'InProgress',
    progress: 0,
    startedAtTick: tick,
    completedAtTick: null,
    labFacilityId,
  }).returning().get()

  return { success: true, researchId: research.id }
}

export function searchRecipes(
  token: string,
  params: {
    outputResource?: string
    inputResource?: string
    facilityType?: string
    techRequired?: string
    unlockedOnly?: boolean
    limit?: number
    offset?: number
  },
): PaginatedResult<Recipe> {
  const db = createGameDb(token)
  const limit = params.limit || 50
  const offset = params.offset || 0

  let recipeQuery = db.select().from(schema.recipes).$dynamic()
  const conditions = []
  if (params.facilityType) {
    conditions.push(eq(schema.recipes.facilityType, params.facilityType))
  }
  if (params.techRequired) {
    conditions.push(eq(schema.recipes.techRequired, params.techRequired))
  }
  if (conditions.length > 0) {
    recipeQuery = recipeQuery.where(and(...conditions))
  }

  let recipes = recipeQuery.limit(limit).offset(offset).all()

  if (params.outputResource) {
    const matchingOutputs = db.select().from(schema.recipeOutputs)
      .where(eq(schema.recipeOutputs.resourceKey, params.outputResource))
      .all()
      .map((r) => r.recipeId)
    recipes = recipes.filter((r) => matchingOutputs.includes(r.id))
  }

  if (params.inputResource) {
    const matchingInputs = db.select().from(schema.recipeInputs)
      .where(eq(schema.recipeInputs.resourceKey, params.inputResource))
      .all()
      .map((r) => r.recipeId)
    recipes = recipes.filter((r) => matchingInputs.includes(r.id))
  }

  const result: Recipe[] = recipes.map((r) => ({
    id: r.id,
    name: r.name,
    facilityType: r.facilityType,
    craftTime: r.craftTime,
    techRequired: r.techRequired,
  }))

  return {
    items: result,
    totalCount: result.length,
    limit,
    offset,
    hasMore: false,
  }
}