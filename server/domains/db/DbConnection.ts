import type { GameDb } from '../../db/client';

export class DbConnection {
  constructor(private readonly db: GameDb) {}

  getDb(): GameDb {
    return this.db;
  }

  transaction<T>(fn: (db: GameDb) => T): T {
    return this.db.transaction(fn);
  }
}
