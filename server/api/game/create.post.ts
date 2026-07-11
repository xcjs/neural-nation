import { defineEventHandler, readBody } from 'h3';
import { DifficultyPreset } from '../../../lib/types/game';
import { IGameFactory } from '../../domains/game/GameModule';
import { useContainer } from '../../utils/container';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const difficulty = (body?.difficulty || DifficultyPreset.Normal) as DifficultyPreset;

  const container = useContainer();
  const gameFactory = container.resolve(IGameFactory);

  const result = gameFactory.createGame(difficulty);

  return {
    token: result.token,
    publicToken: result.publicToken,
    mcpUrl: result.mcpUrl,
  };
});
