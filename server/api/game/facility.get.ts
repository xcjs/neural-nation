import { defineEventHandler, getQuery } from 'h3';
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../../domains/game/GameRegistry';
import { IMcpDispatcher } from '../../domains/mcp/McpModule';
import { createScopedContainer } from '../../utils/container';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = query.token as string | undefined;
  const facilityId = Number.parseInt(String(query.facilityId));

  if (!token) {
    return { status: 401, error: 'Missing token' };
  }

  const entry = findRegistryEntry(token) || findRegistryEntryByPublicToken(token);
  if (!entry) {
    return { status: 404, error: 'Game not found' };
  }

  if (!facilityId) {
    return { status: 400, error: 'Missing facilityId' };
  }

  const scope = createScopedContainer(entry.token);
  const dispatcher = scope.resolve(IMcpDispatcher);
  const result = dispatcher.executeTool(entry.token, 'get_facility_details', { facilityId });

  if (result.status === 'error') {
    return { status: 404, error: result.errorMessage };
  }

  return result.data;
});
