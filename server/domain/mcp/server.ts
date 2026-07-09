import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { MCP_TOOLS } from './tools'
import { executeTool } from './dispatcher'
import { findRegistryEntry } from '../game/registry'

const transports = new Map<string, SSEServerTransport>()
const servers = new Map<string, Server>()

export function createMcpServer(token: string): Server {
  const server = new Server(
    { name: 'neural-nation', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: MCP_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const { name, arguments: args } = request.params
    const result = executeTool(token, name, args || {})

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: result.status === 'error',
    }
  })

  return server
}

export async function connectSseTransport(
  token: string,
  endpoint: string,
  res: import('node:http').ServerResponse,
): Promise<SSEServerTransport> {
  const entry = findRegistryEntry(token)
  if (!entry) throw new Error('Game not found')
  if (entry.publicToken === token) throw new Error('Public token cannot access MCP endpoints')

  const transport = new SSEServerTransport(endpoint, res)
  const server = createMcpServer(token)

  transports.set(transport.sessionId, transport)
  servers.set(transport.sessionId, server)

  transport.onclose = () => {
    transports.delete(transport.sessionId)
    servers.delete(transport.sessionId)
  }

  await server.connect(transport)
  return transport
}

export async function handlePostMessage(
  sessionId: string,
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): Promise<void> {
  const transport = transports.get(sessionId)
  if (!transport) {
    res.writeHead(404).end('Session not found')
    return
  }
  await transport.handlePostMessage(req, res)
}