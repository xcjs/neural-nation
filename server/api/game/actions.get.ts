import { defineEventHandler, getQuery } from 'h3'
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../../domain/game/registry'
import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { like, or, sql, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string | undefined

  if (!token) {
    return { status: 401, error: 'Missing token' }
  }

  const entry = findRegistryEntry(token) || findRegistryEntryByPublicToken(token)
  if (!entry) {
    return { status: 404, error: 'Game not found' }
  }

  const limit = Math.min(parseInt(String(query.limit)) || 25, 200)
  const offset = Math.max(parseInt(String(query.offset)) || 0, 0)
  const search = (query.search as string | undefined)?.trim()

  const db = createGameDb(entry.token)

  let queryBuilder = db.select().from(schema.actions).$dynamic()
  const conditions = []
  if (search) {
    const pattern = `%${search}%`
    conditions.push(
      or(
        like(schema.actions.toolName, pattern),
        like(schema.actions.arguments, pattern),
        like(schema.actions.resultStatus, pattern),
      ),
    )
  }
  if (conditions.length > 0) {
    queryBuilder = queryBuilder.where(conditions[0]!)
  }

  const items = queryBuilder
    .orderBy(desc(schema.actions.id))
    .limit(limit)
    .offset(offset)
    .all()

  const countRow = db.select({ count: sql<number>`count(*)` })
    .from(schema.actions)
    .get()
  const totalCount = countRow?.count ?? items.length

  return { items, totalCount, limit, offset }
})