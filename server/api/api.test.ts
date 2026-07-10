import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { DifficultyPreset } from '../../lib/types/game'
import { removeFromRegistry } from '../domain/game/registry'
import { createGame } from '../domain/game/service'
import { executeTool } from '../domain/mcp/dispatcher'
import gameStateHandler from './game-state.get'
import actionsHandler from './game/actions.get'
import createGameHandler from './game/create.post'
import healthHandler from './health.get'

function mockEvent(method: string, query: Record<string, string> = {}, body?: unknown) {
  const params = new URLSearchParams(query).toString()
  const url = `/?${params}`
  return {
    method,
    path: url,
    node: {
      req: { url, method, headers: {} },
      res: { setHeader: () => {}, end: () => {} },
    },
    context: {},
    body,
  } as never
}

const game = createGame(DifficultyPreset.Normal)
const token = game.token
const publicToken = game.publicToken

afterAll(() => {
  for (const ext of ['', '-shm', '-wal']) {
    try {
      rmSync(resolve('data', 'games', `${token}.db${ext}`), { force: true })
    }
    catch { /* */ }
  }
  removeFromRegistry(token)
})

describe('aPI route handlers', () => {
  describe('gET /api/health', () => {
    it('returns ok status', async () => {
      const event = mockEvent('GET')
      const result = await healthHandler(event)
      expect(result).toEqual(expect.objectContaining({ status: 'ok' }))
      expect(typeof (result as { uptime: number }).uptime).toBe('number')
    })
  })

  describe('pOST /api/game/create', () => {
    it('creates a game and returns token + mcpUrl', async () => {
      const event = mockEvent('POST', {}, { difficulty: 'Normal' })
      const result: any = await createGameHandler(event)
      expect(result.token).toBeTruthy()
      expect(result.publicToken).toBeTruthy()
      expect(result.mcpUrl).toContain('/api/mcp/sse')
      // Cleanup
      for (const ext of ['', '-shm', '-wal']) {
        try {
          rmSync(resolve('data', 'games', `${result.token}.db${ext}`), { force: true })
        }
        catch { /* */ }
      }
      removeFromRegistry(result.token)
    })
  })

  describe('gET /api/game-state', () => {
    it('returns 401 for missing token', async () => {
      const event = mockEvent('GET')
      const result: any = await gameStateHandler(event)
      expect(result.status).toBe(401)
    })

    it('returns 404 for unknown token', async () => {
      const event = mockEvent('GET', { token: 'nonexistent-token-xyz' })
      const result: any = await gameStateHandler(event)
      expect(result.status).toBe(404)
    })

    it('returns game state for valid private token', async () => {
      const event = mockEvent('GET', { token })
      const result: any = await gameStateHandler(event)
      expect(result.meta).toBeDefined()
      expect(result.meta.token).toBe(token)
      expect(result.tick).toBeDefined()
      expect(result.tick.tickCount).toBeDefined()
      expect(result.resources).toBeDefined()
      expect(result.facilities).toBeDefined()
    })

    it('returns game state for valid public token (token redacted)', async () => {
      const event = mockEvent('GET', { token: publicToken })
      const result: any = await gameStateHandler(event)
      expect(result.meta).toBeDefined()
      expect(result.meta.token).toBe('')
      expect(result.meta.publicToken).toBe(publicToken)
      expect(result.tick).toBeDefined()
    })
  })

  describe('gET /api/game/actions', () => {
    it('returns 401 for missing token', async () => {
      const event = mockEvent('GET')
      const result: any = await actionsHandler(event)
      expect(result.status).toBe(401)
    })

    it('returns 404 for unknown token', async () => {
      const event = mockEvent('GET', { token: 'nonexistent-token-xyz' })
      const result: any = await actionsHandler(event)
      expect(result.status).toBe(404)
    })

    it('returns paginated actions for valid token', async () => {
      executeTool(token, 'get_game_state', {})
      const event = mockEvent('GET', { token })
      const result: any = await actionsHandler(event)
      expect(result.items).toBeInstanceOf(Array)
      expect(result.totalCount).toBeGreaterThan(0)
      expect(typeof result.limit).toBe('number')
      expect(typeof result.offset).toBe('number')
    })

    it('respects limit and offset params', async () => {
      executeTool(token, 'get_game_state', {})
      const event = mockEvent('GET', { token, limit: '1', offset: '0' })
      const result: any = await actionsHandler(event)
      expect(result.limit).toBe(1)
      expect(result.offset).toBe(0)
      expect(result.items.length).toBeLessThanOrEqual(1)
    })
  })
})
