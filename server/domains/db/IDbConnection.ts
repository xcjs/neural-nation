import type { GameDb } from '../../db/client';
import { Token } from '../ioc/Token';

export interface IDbConnection {
  getDb: () => GameDb;
  transaction: <T>(fn: (db: GameDb) => T) => T;
}

export const IDbConnection = new Token<IDbConnection>('IDbConnection');
