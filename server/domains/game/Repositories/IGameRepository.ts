import type { GameMeta } from '../../../../lib/types/game';
import type { schema } from '../../../db/schema';
import { Token } from '../../ioc/Token';

export interface IGameRepository {
  getMeta: () => GameMeta | undefined;
  updateTick: (tickCount: number, now: string) => void;
  updateLastActive: (now: string) => void;
  setStatus: (status: string) => void;
  setToken: (token: string, publicToken: string) => void;
  insertMeta: (meta: Omit<typeof schema.meta.$inferInsert, 'id'>) => void;
}

export const IGameRepository = new Token<IGameRepository>('IGameRepository');
