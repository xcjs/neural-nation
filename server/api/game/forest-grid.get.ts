import { gte } from 'drizzle-orm'
import { defineEventHandler, getQuery, setHeader } from 'h3'
import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../../domain/game/registry'

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

  const db = createGameDb(entry.token)

  // Return only cells with density > 0, compact format for texture update
  const minDensity = query.minDensity ? Number.parseFloat(query.minDensity as string) : 0
  let cells
  if (minDensity > 0) {
    cells = db.select()
      .from(schema.forestGrid)
      .where(gte(schema.forestGrid.density, minDensity))
      .all()
  }
  else {
    cells = db.select().from(schema.forestGrid).all()
  }

  // Compact array format: [latIndex, lonIndex, density] triples
  const compact = cells.map(c => [c.latIndex, c.lonIndex, c.density])

  setHeader(event, 'content-type', 'application/json')
  return { cells: compact }
})
