import { defineEventHandler, getQuery } from 'h3'
import { findRegistryEntry } from '../../domain/game/registry'
import { mintNewToken } from '../../domain/game/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string | undefined

  if (!token) {
    return { status: 401, error: 'Missing token' }
  }

  const entry = findRegistryEntry(token)
  if (!entry) {
    return { status: 404, error: 'Game not found' }
  }

  if (entry.publicToken === token) {
    return { status: 403, error: 'Public token cannot mint new tokens' }
  }

  try {
    const result = mintNewToken(token)
    return result
  } catch (err) {
    return { status: 500, error: err instanceof Error ? err.message : 'Failed to mint new token' }
  }
})