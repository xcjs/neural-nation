import { defineEventHandler, getQuery } from 'h3'
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../domain/game/registry'
import { buildFullGameState } from '../domain/game/state'
import { updateLastActive, updateLastActiveInRegistry } from '../domain/game/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string | undefined

  if (!token) {
    return { status: 401, error: 'Missing token' }
  }

  const privateEntry = findRegistryEntry(token)
  const publicEntry = !privateEntry ? findRegistryEntryByPublicToken(token) : null
  const entry = privateEntry || publicEntry
  if (!entry) {
    return { status: 404, error: 'Game not found' }
  }

  const isSpectator = !!publicEntry && !privateEntry
  const gameToken = entry.token
  updateLastActive(gameToken)
  updateLastActiveInRegistry(gameToken)

  const fullState = buildFullGameState(gameToken, isSpectator)
  if (!fullState) {
    return { status: 404, error: 'Game not found' }
  }

  return fullState
})