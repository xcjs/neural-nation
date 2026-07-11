import { defineEventHandler, getQuery } from 'h3';
import { findRegistryEntry } from '../../domains/game/GameRegistry';
import { IMcpServer } from '../../domains/mcp/McpModule';
import { createScopedContainer } from '../../utils/container';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = query.token as string | undefined;

  if (!token) {
    return { status: 401, error: 'Missing token' };
  }

  const entry = findRegistryEntry(token);
  if (!entry) {
    return { status: 404, error: 'Game not found' };
  }

  if (entry.publicToken === token) {
    return { status: 403, error: 'Public token cannot access MCP endpoints' };
  }

  const scope = createScopedContainer(token);
  const mcpServer = scope.resolve(IMcpServer);

  const res = event.node.res;
  const endpoint = `/api/mcp/messages?token=${token}`;

  await mcpServer.connectSseTransport(token, endpoint, res);

  return undefined;
});
