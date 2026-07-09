import { defineEventHandler } from 'h3'
import { closeAllGameDbs } from '~/server/db/client'
import { runCleanup } from '~/server/domain/game/cleanup'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  if (!config.gameCleanupEnabled) return { skipped: true }
  await runCleanup({
    ageDays: config.gameCleanupAgeDays,
    graceDays: config.gameCleanupGraceDays,
  })
  return { ok: true }
})