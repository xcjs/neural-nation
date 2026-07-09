import { defineEventHandler, getQuery } from 'h3'
import { findRegistryEntry } from '../../domain/game/registry'
import { connectSseTransport } from '../../domain/mcp/server'

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
    return { status: 403, error: 'Public token cannot access MCP endpoints' }
  }

  const res = event.node.res
  const endpoint = `/api/mcp/messages?token=${token}`

  await connectSseTransport(token, endpoint, res)

  return undefined
})