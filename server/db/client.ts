import { resolve } from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from './migrate';
import { schema } from './schema';

export type GameDb = BetterSQLite3Database<typeof schema>;

export function getDataDir(): string {
  return process.env.NN_DATA_DIR ?? resolve('data', 'games');
}

const dbCache = new Map<string, GameDb>();

export function getGameDbPath(token: string): string {
  return resolve(getDataDir(), `${token}.db`);
}

export function createGameDb(token: string): GameDb {
  const cached = dbCache.get(token);
  if (cached) {
    return cached;
  }

  const path = getGameDbPath(token);
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  runMigrations(sqlite);

  const db = drizzle(sqlite, { schema });
  dbCache.set(token, db);
  return db;
}

export function closeGameDb(token: string): void {
  const db = dbCache.get(token);
  if (db) {
    const sqlite = (db as unknown as { session: { client: Database.Database } }).session.client;
    sqlite.close();
    dbCache.delete(token);
  }
}

export function closeAllGameDbs(): void {
  for (const token of dbCache.keys()) {
    closeGameDb(token);
  }
}

export function getTemplateDbPath(): string {
  return resolve(getDataDir(), '_template.db');
}
