import { defineEventHandler, readBody } from 'h3'
import { createGame } from '../../domain/game/service'
import { DifficultyPreset } from '../../../lib/types/game'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const difficulty = (body?.difficulty || DifficultyPreset.Normal) as DifficultyPreset

  const result = createGame(difficulty)

  return {
    token: result.token,
    publicToken: result.publicToken,
    mcpUrl: result.mcpUrl,
  }
})