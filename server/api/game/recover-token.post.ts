import { createError, defineEventHandler, getRequestURL, readBody } from 'h3';
import { findRegistryEntryByPublicToken } from '../../domains/game/GameRegistry';
import { buildMcpUrl } from '../../domains/game/McpUrlBuilder';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const publicToken = body?.publicToken;
  if (!publicToken || typeof publicToken !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'publicToken required' });
  }
  const entry = findRegistryEntryByPublicToken(publicToken);
  if (!entry) {
    throw createError({ statusCode: 404, statusMessage: 'game not found' });
  }
  const origin = getRequestURL(event).origin;
  return {
    privateToken: entry.token,
    mcpUrl: buildMcpUrl(entry.token, origin),
  };
});
