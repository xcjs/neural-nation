import { defineEventHandler, getQuery } from 'h3'
import { handlePostMessage } from '../../domain/mcp/server'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sessionId = query.sessionId as string | undefined

  if (!sessionId) {
    return { status: 400, error: 'Missing sessionId' }
  }

  const req = event.node.req
  const res = event.node.res

  await handlePostMessage(sessionId, req, res)

  return undefined
})
