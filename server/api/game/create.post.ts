import { defineEventHandler, getRequestURL } from 'h3';
import { IGameFactory } from '../../domains/game/GameModule';
import { useContainer } from '../../utils/container';

export default defineEventHandler(async (event) => {
  const container = useContainer();
  const gameFactory = container.resolve(IGameFactory);

  const origin = getRequestURL(event).origin;
  const result = gameFactory.createGame(origin);

  return {
    token: result.token,
    publicToken: result.publicToken,
    mcpUrl: result.mcpUrl,
  };
});
