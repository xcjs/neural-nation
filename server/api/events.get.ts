import { createEventStream, defineEventHandler, getQuery } from 'h3';
import { IEventBus } from '../domains/events/IEventBus';
import { IGameService, IGameStateService } from '../domains/game/GameModule';
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../domains/game/GameRegistry';
import { createScopedContainer } from '../utils/container';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = query.token as string | undefined;

  if (!token) {
    return { status: 401, error: 'Missing token' };
  }

  const entry = findRegistryEntry(token) || findRegistryEntryByPublicToken(token);
  if (!entry) {
    return { status: 404, error: 'Game not found' };
  }

  const gameToken = entry.token;
  const isSpectator = entry.publicToken === token;

  const scope = createScopedContainer(gameToken);
  const gameService = scope.resolve(IGameService);
  const stateService = scope.resolve(IGameStateService);
  const eventBus = scope.resolve(IEventBus);

  gameService.updateLastActive();
  gameService.updateLastActiveInRegistry(gameToken);

  const stream = createEventStream(event);

  const sendEvent = (data: unknown) => {
    stream.push(JSON.stringify(data)).catch(() => {
      // stream may be closed
    });
  };

  const sendFullState = () => {
    const state = stateService.buildFullGameState(entry, isSpectator);
    if (state)
      sendEvent({ type: 'full_state', state });
  };

  sendFullState();

  const unsubscribe = eventBus.subscribe(gameToken, (gameEvent) => {
    sendEvent(gameEvent);
  });

  const heartbeat = setInterval(() => {
    sendEvent({ type: 'heartbeat' });
  }, 30000);

  event.node.req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });

  return stream.send();
});
