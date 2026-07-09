import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { TechTreeNode, Recipe, RecipeInput, TechUnlock } from '../../../lib/types/tech'
import { TechBranch, TechStatus } from '../../../lib/types/tech'
import type { PaginatedResult } from '../../../lib/types/mcp'

export function getTechTree(token: string): TechTreeNode[] {
  const db = createGameDb(token)

  const nodes = db.select().from(schema.techNodes).all()
  const research = db.select().from(schema.gameResearch).all()
  const prerequisites = db.select().from(schema.techPrerequisites).all()
  const costs = db.select().from(schema.techCosts).all()
  const unlocks = db.select().from(schema.techUnlocks).all()

  return nodes.map((node) => {
    const researchEntry = research.find((r) => r.techId === node.id)
    let status: TechStatus = TechStatus.Available

    if (researchEntry?.status === 'Completed') {
      status = TechStatus.Completed
    } else if (researchEntry?.status === 'InProgress') {
      status = TechStatus.InProgress
    }

    const nodePrerequisites = prerequisites.filter((p) => p.techId === node.id).map((p) => p.prerequisiteId)
    const nodeCosts: RecipeInput[] = costs
      .filter((c) => c.techId === node.id)
      .map((c) => ({
        resourceKey: c.resourceKey,
        quantity: c.quantity,
        unit: c.unit,
        optional: false,
      }))
    const nodeUnlocks: TechUnlock[] = unlocks
      .filter((u) => u.techId === node.id)
      .map((u) => ({
        type: u.unlockType as TechUnlock['type'],
        id: u.unlockId,
      }))

    return {
      id: node.id,
      name: node.name,
      description: node.description,
      tier: node.tier,
      category: node.category as TechBranch,
      prerequisites: nodePrerequisites,
      researchCost: nodeCosts,
      researchTime: node.researchTime,
      unlocks: nodeUnlocks,
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

  const allInputs = db.select().from(schema.recipeInputs).all()
  const allOutputs = db.select().from(schema.recipeOutputs).all()

  const recipes: Recipe[] = recipeRows.map((row) => ({
    id: row.id,
    name: row.name,
    facilityType: row.facilityType,
    inputs: allInputs
      .filter((i) => i.recipeId === row.id)
      .map((i) => ({
        resourceKey: i.resourceKey,
        quantity: i.quantity,
        unit: i.unit,
        optional: Boolean(i.optional),
      })),
    outputs: allOutputs
      .filter((o) => o.recipeId === row.id)
      .map((o) => ({
        resourceKey: o.resourceKey,
        quantity: o.quantity,
        unit: o.unit,
      })),
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

  // Validate the tech node exists
  const techNode = db.select().from(schema.techNodes)
    .where(eq(schema.techNodes.id, techNodeId))
    .get()
  if (!techNode) {
    throw new Error(`Tech node not found: ${techNodeId}`)
  }

  // Reject if already started or completed
  const existing = db.select().from(schema.gameResearch)
    .where(eq(schema.gameResearch.techId, techNodeId))
    .get()
  if (existing) {
    throw new Error(`Research already ${existing.status} for ${techNodeId}`)
  }

  // Check prerequisites are all Completed
  const prereqs = db.select().from(schema.techPrerequisites)
    .where(eq(schema.techPrerequisites.techId, techNodeId))
    .all()
  if (prereqs.length > 0) {
    const completedTechIds = db.select().from(schema.gameResearch)
      .where(eq(schema.gameResearch.status, 'Completed'))
      .all()
      .map((r) => r.techId)
    const missing = prereqs.filter((p) => !completedTechIds.includes(p.prerequisiteId))
    if (missing.length > 0) {
      const missingIds = missing.map((p) => p.prerequisiteId).join(', ')
      throw new Error(`Tech prerequisites not met for ${techNodeId}: requires ${missingIds}`)
    }
  }

  // Validate the lab facility exists, is a ResearchLab, and is Active
  const lab = db.select().from(schema.facilities)
    .where(eq(schema.facilities.id, labFacilityId))
    .get()
  if (!lab) {
    throw new Error(`Facility not found: ${labFacilityId}`)
  }
  if (lab.type !== 'ResearchLab') {
    throw new Error(`Facility ${labFacilityId} is a ${lab.type}, not a ResearchLab`)
  }
  if (lab.status !== 'Active') {
    throw new Error(`Research lab ${labFacilityId} is ${lab.status}, must be Active`)
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

  const allInputs = db.select().from(schema.recipeInputs).all()
  const allOutputs = db.select().from(schema.recipeOutputs).all()

  const result: Recipe[] = recipes.map((r) => ({
    id: r.id,
    name: r.name,
    facilityType: r.facilityType,
    inputs: allInputs
      .filter((i) => i.recipeId === r.id)
      .map((i) => ({
        resourceKey: i.resourceKey,
        quantity: i.quantity,
        unit: i.unit,
        optional: Boolean(i.optional),
      })),
    outputs: allOutputs
      .filter((o) => o.recipeId === r.id)
      .map((o) => ({
        resourceKey: o.resourceKey,
        quantity: o.quantity,
        unit: o.unit,
      })),
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