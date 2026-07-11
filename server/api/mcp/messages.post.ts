import { defineEventHandler, getQuery } from 'h3';
import { IMcpServer } from '../../domains/mcp/McpModule';
import { createScopedContainer } from '../../utils/container';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const sessionId = query.sessionId as string | undefined;
  const token = query.token as string | undefined;

  if (!sessionId) {
    return { status: 400, error: 'Missing sessionId' };
  }

  if (!token) {
    return { status: 401, error: 'Missing token' };
  }

  const scope = createScopedContainer(token);
  const mcpServer = scope.resolve(IMcpServer);

  const req = event.node.req;
  const res = event.node.res;

  await mcpServer.handlePostMessage(sessionId, req, res);

  return undefined;
});
