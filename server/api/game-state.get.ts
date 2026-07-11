import { defineEventHandler, getQuery } from 'h3';
import { IGameService, IGameStateService } from '../domains/game/GameModule';
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../domains/game/GameRegistry';
import { createScopedContainer } from '../utils/container';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = query.token as string | undefined;

  if (!token) {
    return { status: 401, error: 'Missing token' };
  }

  const privateEntry = findRegistryEntry(token);
  const publicEntry = !privateEntry ? findRegistryEntryByPublicToken(token) : null;
  const entry = privateEntry || publicEntry;
  if (!entry) {
    return { status: 404, error: 'Game not found' };
  }

  const isSpectator = !!publicEntry && !privateEntry;
  const gameToken = entry.token;

  const scope = createScopedContainer(gameToken);
  const gameService = scope.resolve(IGameService);
  const stateService = scope.resolve(IGameStateService);

  gameService.updateLastActive();
  gameService.updateLastActiveInRegistry(gameToken);

  const fullState = stateService.buildFullGameState(entry, isSpectator);
  if (!fullState) {
    return { status: 404, error: 'Game not found' };
  }

  return fullState;
});
