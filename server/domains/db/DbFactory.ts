import type { GameDb } from '../../db/client';
import { resolve } from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../../db/migrate';
import { schema } from '../../db/schema';

export function getDataDir(): string {
  return process.env.NN_DATA_DIR ?? resolve('data', 'games');
}

export function getGameDbPath(token: string): string {
  return resolve(getDataDir(), `${token}.db`);
}

export function getTemplateDbPath(): string {
  return resolve(getDataDir(), '_template.db');
}

export function createGameDbFromPath(path: string): GameDb {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);
  return drizzle(sqlite, { schema });
}

export function createGameDb(token: string): GameDb {
  return createGameDbFromPath(getGameDbPath(token));
}

export function closeGameDb(db: GameDb): void {
  const sqlite = (db as unknown as { session: { client: Database.Database } }).session.client;
  sqlite.close();
}
