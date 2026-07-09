import { defineEventHandler, getQuery } from 'h3'
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../domain/game/registry'
import { getGameState } from '../domain/mcp/dispatcher'

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

  return getGameState(entry.token)
})