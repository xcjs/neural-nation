import { defineEventHandler } from 'h3';
import { IGameFactory } from '../../domains/game/GameModule';
import { useContainer } from '../../utils/container';

export default defineEventHandler(async () => {
  const container = useContainer();
  const gameFactory = container.resolve(IGameFactory);

  const result = gameFactory.createGame();

  return {
    token: result.token,
    publicToken: result.publicToken,
    mcpUrl: result.mcpUrl,
  };
});
