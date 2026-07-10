import { defineEventHandler, getQuery } from 'h3'
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../../domain/game/registry'
import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { sql, desc } from 'drizzle-orm'

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

  const db = createGameDb(entry.token)

  const items = db.select()
    .from(schema.events)
    .orderBy(desc(schema.events.id))
    .limit(limit)
    .offset(offset)
    .all()

  const countRow = db.select({ count: sql<number>`count(*)` })
    .from(schema.events)
    .get()
  const totalCount = countRow?.count ?? items.length

  return { items, totalCount, limit, offset }
})