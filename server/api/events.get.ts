import { defineEventHandler, getQuery, createEventStream } from 'h3'
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../domain/game/registry'
import { buildFullGameState } from '../domain/game/state'
import { subscribe } from '../domain/events/bus'
import { updateLastActive, updateLastActiveInRegistry } from '../domain/game/service'

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

  const gameToken = entry.token
  const isSpectator = entry.publicToken === token
  updateLastActive(gameToken)
  updateLastActiveInRegistry(gameToken)
  const stream = createEventStream(event)

  const sendEvent = (data: unknown) => {
    stream.push(JSON.stringify(data)).catch(() => {
      // stream may be closed
    })
  }

  const sendFullState = () => {
    const state = buildFullGameState(gameToken, isSpectator)
    if (state) sendEvent({ type: 'full_state', state })
  }

  // Send initial full state
  sendFullState()

  // Subscribe to granular events from the bus
  const unsubscribe = subscribe(gameToken, (gameEvent) => {
    sendEvent(gameEvent)
  })

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    sendEvent({ type: 'heartbeat' })
  }, 30000)

  event.node.req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })

  return stream.send()
})