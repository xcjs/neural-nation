import { defineEventHandler, getQuery, createEventStream } from 'h3'
import { findRegistryEntry } from '../../domain/game/registry'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string | undefined

  if (!token) {
    return createErrorResponse(401, 'Missing token')
  }

  const entry = findRegistryEntry(token)
  if (!entry) {
    return createErrorResponse(404, 'Game not found')
  }

  if (entry.publicToken === token) {
    return createErrorResponse(403, 'Public token cannot access MCP endpoints')
  }

  const stream = createEventStream(event)

  const initMessage = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'neural-nation', version: '0.1.0' },
    },
  }

  await stream.push(JSON.stringify(initMessage))

  const heartbeat = setInterval(() => {
    stream.push(JSON.stringify({ jsonrpc: '2.0', method: 'heartbeat', params: {} }))
  }, 30000)

  event.node.req.on('close', () => {
    clearInterval(heartbeat)
  })

  return stream.send()
})

function createErrorResponse(status: number, message: string) {
  return {
    status,
    body: { error: message },
  }
}