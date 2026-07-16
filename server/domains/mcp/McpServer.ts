import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IToolRegistry } from './IToolRegistry';
import type { McpDispatcher } from './McpDispatcher';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { useRuntimeConfig } from 'nitropack/runtime';

const transports = new Map<string, SSEServerTransport>();
const servers = new Map<string, Server>();

export class McpServer {
  constructor(
    private readonly toolRegistry: IToolRegistry,
    private readonly dispatcher: McpDispatcher,
  ) {}

  createServer(token: string): Server {
    const { version } = useRuntimeConfig().public;
    const server = new Server(
      { name: 'neural-nation', version },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: this.toolRegistry.getToolDefinitions().map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, (request) => {
      const { name, arguments: args } = request.params;
      const result = this.dispatcher.executeTool(token, name, args || {});

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: result.status === 'error',
      };
    });

    return server;
  }

  async connectSseTransport(token: string, endpoint: string, res: ServerResponse): Promise<SSEServerTransport> {
    const transport = new SSEServerTransport(endpoint, res);
    const server = this.createServer(token);

    transports.set(transport.sessionId, transport);
    servers.set(transport.sessionId, server);

    transport.onclose = () => {
      transports.delete(transport.sessionId);
      servers.delete(transport.sessionId);
    };

    await server.connect(transport);
    return transport;
  }

  async handlePostMessage(sessionId: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const transport = transports.get(sessionId);
    if (!transport) {
      res.writeHead(404).end('Session not found');
      return;
    }
    await transport.handlePostMessage(req, res);
  }
}
