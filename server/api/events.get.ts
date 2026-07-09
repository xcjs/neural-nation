import { defineEventHandler, getQuery, createEventStream } from 'h3'
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../../domain/game/registry'
import { getGameState } from '../../domain/mcp/dispatcher'

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

  const stream = createEventStream(event)

  const fullState = getGameState(entry.token)
  await stream.push(JSON.stringify({ type: 'full_state', data: fullState }))

  const interval = setInterval(() => {
    const state = getGameState(entry.token)
    stream.push(JSON.stringify({ type: 'tick', data: state }))
  }, 5000)

  event.node.req.on('close', () => {
    clearInterval(interval)
  })

  return stream.send()
})