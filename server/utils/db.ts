import { createGameDb, type GameDb } from '../db/client'

export function getDb(token: string): GameDb {
  return createGameDb(token)
}