import type { PaginatedResult, PaginationParams } from '../../../lib/types/mcp'
import type { ResourceOverviewRow, ResourceStockpileEntry } from '../../../lib/types/resource'
import { and, eq, like, sql } from 'drizzle-orm'
import { ELEMENTS } from '../../../lib/constants/elements'
import { ResourceCategory, ResourceUnit, TrendDirection } from '../../../lib/types/resource'
import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'

export function surveyRegion(
  token: string,
  lat: number,
  lon: number,
  radius: number,
): { depositsFound: number, discovered: Array<{ resourceKey: string, quantity: number, grade: number }> } {
  const db = createGameDb(token)

  const deposits = db.select().from(schema.resources).where(
    and(
      sql`${schema.resources.discovered} = 0`,
      sql`abs(${schema.resources.lat} - ${lat}) <= ${radius}`,
      sql`abs(${schema.resources.lon} - ${lon}) <= ${radius}`,
    ),
  ).all()

  const discovered: Array<{ resourceKey: string, quantity: number, grade: number }> = []
  let depositsFound = 0

  for (const deposit of deposits) {
    const distance = Math.sqrt(
      (deposit.lat - lat) ** 2 + (deposit.lon - lon) ** 2,
    )

    if (distance <= radius) {
      db.update(schema.resources)
        .set({ discovered: 1 })
        .where(eq(schema.resources.id, deposit.id))
        .run()

      discovered.push({
        resourceKey: deposit.resourceKey,
        quantity: deposit.remaining,
        grade: deposit.grade,
      })
      depositsFound++
    }
  }

  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()
  const tick = meta?.tickCount || 0

  db.insert(schema.surveyLog).values({
    tick,
    timestamp: new Date().toISOString(),
    lat,
    lon,
    radius,
    depositsFound,
  }).run()

  return { depositsFound, discovered }
}

export function getDiscoveredResources(
  token: string,
  params: PaginationParams = {},
): PaginatedResult<{ id: number, resourceKey: string, name: string, lat: number, lon: number, quantity: number, remaining: number, grade: number, surface: number, depth: number | null, unit: string, category: string, discovered: number }> {
  const db = createGameDb(token)
  const limit = params.limit || 50
  const offset = params.offset || 0

  const items = db.select().from(schema.resources).where(eq(schema.resources.discovered, 1)).limit(limit).offset(offset).all()

  const totalCount = db.select({ count: sql<number>`count(*)` })
    .from(schema.resources)
    .where(eq(schema.resources.discovered, 1))
    .get()
    ?.count || 0

  return {
    items,
    totalCount,
    limit,
    offset,
    hasMore: offset + items.length < totalCount,
  }
}

export function getResourceOverview(token: string): ResourceOverviewRow[] {
  const db = createGameDb(token)

  const deposits = db.select().from(schema.resources).all()
  const stockpiles = db.select().from(schema.stockpiles).all()

  const resourceMap = new Map<string, { collected: number, remaining: number, total: number }>()

  for (const deposit of deposits) {
    const existing = resourceMap.get(deposit.resourceKey)
    if (existing) {
      existing.remaining += deposit.remaining
      existing.total += deposit.quantity
    }
    else {
      resourceMap.set(deposit.resourceKey, {
        collected: 0,
        remaining: deposit.remaining,
        total: deposit.quantity,
      })
    }
  }

  for (const stockpile of stockpiles) {
    const existing = resourceMap.get(stockpile.resourceKey)
    if (existing) {
      existing.collected += stockpile.quantity
    }
    else {
      resourceMap.set(stockpile.resourceKey, {
        collected: stockpile.quantity,
        remaining: 0,
        total: 0,
      })
    }
  }

  const rows: ResourceOverviewRow[] = []

  for (const [resourceKey, data] of resourceMap) {
    if (data.collected === 0 && data.remaining === 0 && data.total === 0)
      continue
    const category = categorizeResource(resourceKey)
    const unit = getUnitForCategory(category)
    const trend = data.remaining > 0 ? TrendDirection.Stable : TrendDirection.Down

    rows.push({
      resourceKey,
      name: getResourceName(resourceKey),
      category,
      collected: data.collected,
      remaining: data.remaining,
      total: data.total,
      unit,
      productionRate: 0,
      trend,
    })
  }

  return rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
}

export function getResourceDetails(token: string, resourceKey: string) {
  const db = createGameDb(token)

  const deposits = db.select().from(schema.resources).where(eq(schema.resources.resourceKey, resourceKey)).all()

  const stockpiles = db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, resourceKey)).all()

  return { resourceKey, deposits, stockpiles }
}

export function getResourceStockpile(
  token: string,
  resourceKey?: string,
): ResourceStockpileEntry[] {
  const db = createGameDb(token)

  const query = resourceKey
    ? db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, resourceKey))
    : db.select().from(schema.stockpiles)

  const rows = query.all()

  return rows.map(r => ({
    resourceKey: r.resourceKey,
    facilityId: r.facilityId,
    quantity: r.quantity,
    unit: r.unit as ResourceUnit,
  }))
}

export function searchResources(
  token: string,
  params: {
    query?: string
    category?: string
    usedByRecipe?: string
    producedByRecipe?: string
    neededForFacility?: string
    neededForTech?: string
    limit?: number
    offset?: number
  },
): PaginatedResult<{ resourceKey: string, name: string, category: string }> {
  const db = createGameDb(token)
  const limit = Math.min(params.limit || 50, 200)
  const offset = Math.max(params.offset || 0, 0)

  let queryBuilder = db.select({
    resourceKey: schema.resources.resourceKey,
    name: schema.resources.name,
    category: schema.resources.category,
  }).from(schema.resources).$dynamic()

  const conditions = []

  if (params.query) {
    conditions.push(
      like(schema.resources.name, `%${params.query}%`),
    )
  }

  if (params.category) {
    conditions.push(eq(schema.resources.category, params.category))
  }

  // Relationship filters: collect matching resourceKeys from related tables
  const relationshipKeys = new Set<string>()

  if (params.usedByRecipe) {
    // Resources used as inputs to a specific recipe
    const inputs = db.select().from(schema.recipeInputs).where(eq(schema.recipeInputs.recipeId, params.usedByRecipe)).all()
    inputs.forEach(i => relationshipKeys.add(i.resourceKey))
  }

  if (params.producedByRecipe) {
    // Resources produced as outputs of a specific recipe
    const outputs = db.select().from(schema.recipeOutputs).where(eq(schema.recipeOutputs.recipeId, params.producedByRecipe)).all()
    outputs.forEach(o => relationshipKeys.add(o.resourceKey))
  }

  if (params.neededForFacility) {
    // Resources needed as inputs by recipes for a specific facility type
    const recipesForType = db.select().from(schema.recipes).where(eq(schema.recipes.facilityType, params.neededForFacility)).all().map(r => r.id)
    if (recipesForType.length > 0) {
      const inputs = db.select().from(schema.recipeInputs).all().filter(i => recipesForType.includes(i.recipeId))
      inputs.forEach(i => relationshipKeys.add(i.resourceKey))
    }
  }

  if (params.neededForTech) {
    // Resources needed as research costs for a specific tech
    const costs = db.select().from(schema.techCosts).where(eq(schema.techCosts.techId, params.neededForTech)).all()
    costs.forEach(c => relationshipKeys.add(c.resourceKey))
  }

  if (relationshipKeys.size > 0) {
    const keys = [...relationshipKeys]
    conditions.push(sql`${schema.resources.resourceKey} IN (${sql.join(keys.map(k => sql`${k}`), sql`,`)})`)
  }

  if (conditions.length > 0) {
    queryBuilder = queryBuilder.where(and(...conditions))
  }

  const items = queryBuilder.limit(limit).offset(offset).all()

  // Count with same conditions for correct totalCount
  const countQuery = db.select({ count: sql<number>`count(distinct ${schema.resources.resourceKey})` })
    .from(schema.resources)
    .$dynamic()
  if (conditions.length > 0) {
    countQuery.where(and(...conditions))
  }
  const totalCount = countQuery.get()?.count || 0

  return {
    items,
    totalCount,
    limit,
    offset,
    hasMore: offset + items.length < totalCount,
  }
}

function categorizeResource(resourceKey: string): ResourceCategory {
  const element = ELEMENTS.find(e => e.symbol.toLowerCase() === resourceKey.toLowerCase() || e.name === resourceKey)
  if (element) {
    return ResourceCategory.Element
  }

  const renewableKeys = ['wood', 'water', 'arableland', 'biomass', 'population', 'solar', 'wind', 'hydro', 'Wood', 'Water', 'ArableLand', 'Biomass', 'Population', 'Solar', 'Wind', 'Hydro']
  if (renewableKeys.includes(resourceKey)) {
    return ResourceCategory.Renewable
  }

  const nonRenewableKeys = ['coal', 'oil', 'naturalgas', 'stone', 'gravel', 'uranium', 'thorium', 'Coal', 'Oil', 'NaturalGas', 'Stone', 'Gravel', 'Uranium', 'Thorium']
  if (nonRenewableKeys.includes(resourceKey)) {
    return ResourceCategory.NonRenewable
  }

  return ResourceCategory.Manufactured
}

function getUnitForCategory(category: ResourceCategory): ResourceUnit {
  switch (category) {
    case ResourceCategory.Renewable:
    case ResourceCategory.NonRenewable:
    case ResourceCategory.Element:
    case ResourceCategory.Manufactured:
    default:
      return ResourceUnit.Tonne
  }
}

function getResourceName(resourceKey: string): string {
  const element = ELEMENTS.find(e => e.symbol.toLowerCase() === resourceKey.toLowerCase())
  if (element) {
    return element.name
  }
  return resourceKey
}
