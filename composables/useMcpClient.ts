import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { onUnmounted } from 'vue';

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpCallToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export function useMcpClient(token: string | (() => string)) {
  let client: Client | null = null;
  let transport: SSEClientTransport | null = null;
  let connected = false;

  function resolveToken(): string {
    return typeof token === 'function' ? token() : token;
  }

  async function connect(): Promise<void> {
    if (connected)
      return;

    const resolved = resolveToken();
    if (!resolved)
      throw new Error('No token available');
    const sseUrl = new URL(`/api/mcp/sse?token=${encodeURIComponent(resolved)}`, window.location.origin);
    transport = new SSEClientTransport(sseUrl);

    client = new Client(
      { name: 'neural-nation-in-browser', version: '1.0.0' },
      { capabilities: {} },
    );

    await client.connect(transport);
    connected = true;
  }

  async function listTools(): Promise<McpToolDef[]> {
    if (!client)
      throw new Error('MCP client not connected');
    const result = await client.listTools();
    return result.tools.map((t: Tool) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
    }));
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
    if (!client)
      throw new Error('MCP client not connected');
    const result = await client.callTool({ name, arguments: args });
    return result as unknown as McpCallToolResult;
  }

  async function disconnect(): Promise<void> {
    if (transport) {
      await transport.close();
      transport = null;
    }
    client = null;
    connected = false;
  }

  onUnmounted(disconnect);

  return { connect, listTools, callTool, disconnect };
}
