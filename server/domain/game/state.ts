import { eq } from 'drizzle-orm'
import { type FullGameState, type GameMeta, GameStatus, type TickState } from '../../../lib/types/game'
import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { listFacilities } from '../facilities'
import { getEnvironmentalStatus } from '../humanity'
import { getPowerGridStatus } from '../power'
import { getResourceOverview } from '../resources'
import { getSpaceStatus } from '../space'
import { getTechTree } from '../tech'
import { listTransports } from '../transport'
import { findRegistryEntry, findRegistryEntryByPublicToken } from './registry'

export function buildFullGameState(token: string, isSpectator: boolean = false): FullGameState | null {
  const entry = findRegistryEntry(token) || findRegistryEntryByPublicToken(token)
  if (!entry)
    return null

  const gameToken = entry.token
  const db = createGameDb(gameToken)
  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()
  if (!meta)
    return null

  const gameMeta: GameMeta = {
    token: isSpectator ? '' : meta.token ?? gameToken,
    publicToken: meta.publicToken ?? entry.publicToken,
    createdAt: meta.createdAt ?? entry.createdAt,
    lastActiveAt: meta.lastActiveAt ?? entry.lastActive,
    lastTickAt: meta.lastTickAt,
    tickCount: meta.tickCount ?? 0,
    status: (meta.status as GameStatus) || GameStatus.Active,
    difficulty: meta.difficulty as never,
    cleanupEligibleAt: meta.cleanupEligibleAt,
  }

  const tickState: TickState = {
    tickCount: meta.tickCount ?? 0,
    status: (meta.status as GameStatus) || GameStatus.Active,
    lastTickAt: meta.lastTickAt,
  }

  return {
    meta: gameMeta,
    tick: tickState,
    resources: getResourceOverview(gameToken),
    facilities: listFacilities(gameToken, { limit: 200, offset: 0 }).items,
    transports: listTransports(gameToken, { limit: 200, offset: 0 }).items,
    environment: getEnvironmentalStatus(gameToken).environment,
    techTree: getTechTree(gameToken),
    power: getPowerGridStatus(gameToken),
    space: getSpaceStatus(gameToken),
  }
}
