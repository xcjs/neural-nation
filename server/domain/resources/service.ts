import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { eq, like, and, sql } from 'drizzle-orm'
import type { ResourceOverviewRow, ResourceStockpileEntry } from '../../../lib/types/resource'
import { ResourceCategory, ResourceUnit, TrendDirection } from '../../../lib/types/resource'
import { ELEMENTS } from '../../../lib/constants/elements'
import type { PaginationParams, PaginatedResult } from '../../../lib/types/mcp'

const GRID_SIZE = 0.1

export function surveyRegion(
  token: string,
  lat: number,
  lon: number,
  radius: number,
): { depositsFound: number; discovered: Array<{ resourceKey: string; quantity: number; grade: number }> } {
  const db = createGameDb(token)

  const deposits = db.select().from(schema.resources)
    .where(
      and(
        sql`${schema.resources.discovered} = 0`,
        sql`abs(${schema.resources.lat} - ${lat}) <= ${radius}`,
        sql`abs(${schema.resources.lon} - ${lon}) <= ${radius}`,
      ),
    )
    .all()

  const discovered: Array<{ resourceKey: string; quantity: number; grade: number }> = []
  let depositsFound = 0

  for (const deposit of deposits) {
    const distance = Math.sqrt(
      Math.pow(deposit.lat - lat, 2) + Math.pow(deposit.lon - lon, 2),
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
): PaginatedResult<{ id: number; resourceKey: string; name: string; lat: number; lon: number; quantity: number; remaining: number; grade: number; surface: boolean; depth: number | null }> {
  const db = createGameDb(token)
  const limit = params.limit || 50
  const offset = params.offset || 0

  const items = db.select().from(schema.resources)
    .where(eq(schema.resources.discovered, 1))
    .limit(limit)
    .offset(offset)
    .all()

  const totalCount = db.select({ count: sql<number>`count(*)` })
    .from(schema.resources)
    .where(eq(schema.resources.discovered, 1))
    .get()?.count || 0

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

  const resourceMap = new Map<string, { collected: number; remaining: number; total: number }>()

  for (const deposit of deposits) {
    const existing = resourceMap.get(deposit.resourceKey)
    if (existing) {
      existing.remaining += deposit.remaining
      existing.total += deposit.quantity
    } else {
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
    } else {
      resourceMap.set(stockpile.resourceKey, {
        collected: stockpile.quantity,
        remaining: 0,
        total: 0,
      })
    }
  }

  const rows: ResourceOverviewRow[] = []

  for (const [resourceKey, data] of resourceMap) {
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

  const deposits = db.select().from(schema.resources)
    .where(eq(schema.resources.resourceKey, resourceKey))
    .all()

  const stockpiles = db.select().from(schema.stockpiles)
    .where(eq(schema.stockpiles.resourceKey, resourceKey))
    .all()

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

  return rows.map((r) => ({
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
): PaginatedResult<{ resourceKey: string; name: string; category: string }> {
  const db = createGameDb(token)
  const limit = params.limit || 50
  const offset = params.offset || 0

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

  if (conditions.length > 0) {
    queryBuilder = queryBuilder.where(and(...conditions))
  }

  const items = queryBuilder.limit(limit).offset(offset).all()

  const totalCount = db.select({ count: sql<number>`count(distinct ${schema.resources.resourceKey})` })
    .from(schema.resources)
    .get()?.count || 0

  return {
    items,
    totalCount,
    limit,
    offset,
    hasMore: offset + items.length < totalCount,
  }
}

function categorizeResource(resourceKey: string): ResourceCategory {
  const element = ELEMENTS.find((e) => e.symbol === resourceKey || e.name === resourceKey)
  if (element) {
    return ResourceCategory.Element
  }

  const renewableKeys = ['Wood', 'Water', 'ArableLand', 'Biomass', 'Population', 'Solar', 'Wind', 'Hydro']
  if (renewableKeys.includes(resourceKey)) {
    return ResourceCategory.Renewable
  }

  const nonRenewableKeys = ['Coal', 'Oil', 'NaturalGas', 'Stone', 'Gravel', 'Uranium', 'Thorium']
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
  const element = ELEMENTS.find((e) => e.symbol === resourceKey)
  if (element) {
    return element.name
  }
  return resourceKey
}