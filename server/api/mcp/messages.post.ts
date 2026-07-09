import { defineEventHandler, readBody, getQuery } from 'h3'
import { findRegistryEntry } from '../../domain/game/registry'
import { MCP_TOOLS } from '../../domain/mcp/tools'
import { executeTool } from '../../domain/mcp/dispatcher'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string | undefined

  if (!token) {
    return createJsonRpcError(401, -32001, 'Missing token')
  }

  const entry = findRegistryEntry(token)
  if (!entry) {
    return createJsonRpcError(404, -32002, 'Game not found')
  }

  if (entry.publicToken === token) {
    return createJsonRpcError(403, -32003, 'Public token cannot access MCP endpoints')
  }

  const body = await readBody(event)
  const { method, params, id } = body || {}

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'neural-nation', version: '0.1.0' },
      },
    }
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
    }
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {}
    const result = executeTool(token, name, args || {})

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: result.status === 'error',
      },
    }
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Unknown method: ${method}` },
  }
})

function createJsonRpcError(_status: number, code: number, message: string) {
  return {
    jsonrpc: '2.0',
    id: null,
    error: { code, message },
  }
}