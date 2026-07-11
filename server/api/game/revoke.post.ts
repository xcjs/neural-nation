import { defineEventHandler, getQuery } from 'h3';
import { IGameService } from '../../domains/game/GameModule';
import { findRegistryEntry } from '../../domains/game/GameRegistry';
import { useContainer } from '../../utils/container';

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
    return { status: 403, error: 'Public token cannot revoke games' };
  }

  try {
    const container = useContainer();
    const gameService = container.resolve(IGameService);
    gameService.revokeToken(token);
    return { success: true };
  }
  catch (err) {
    return { status: 500, error: err instanceof Error ? err.message : 'Failed to revoke' };
  }
});
