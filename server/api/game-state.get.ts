import { defineEventHandler, getQuery } from 'h3'
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../domain/game/registry'
import { createGameDb } from '../db/client'
import { schema } from '../db/schema'
import { eq } from 'drizzle-orm'
import { GameStatus, type GameMeta, type TickState, type FullGameState } from '../../lib/types/game'
import { getResourceOverview } from '../domain/resources'
import { listFacilities } from '../domain/facilities'
import { listTransports } from '../domain/transport'
import { getEnvironmentalStatus } from '../domain/humanity'
import { getTechTree } from '../domain/tech'
import { getPowerGridStatus } from '../domain/power'
import { getSpaceStatus } from '../domain/space'
import { updateLastActive, updateLastActiveInRegistry } from '../domain/game/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string | undefined

  if (!token) {
    return { status: 401, error: 'Missing token' }
  }

  const privateEntry = findRegistryEntry(token)
  const publicEntry = !privateEntry ? findRegistryEntryByPublicToken(token) : null
  const entry = privateEntry || publicEntry
  if (!entry) {
    return { status: 404, error: 'Game not found' }
  }

  const isSpectator = !!publicEntry && !privateEntry
  const gameToken = entry.token
  updateLastActive(gameToken)
  updateLastActiveInRegistry(gameToken)
  const db = createGameDb(gameToken)
  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()
  if (!meta) {
    return { status: 404, error: 'Game not found' }
  }

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

  const fullState: FullGameState = {
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

  return fullState
})