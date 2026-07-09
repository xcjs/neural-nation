import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime/internal/config'
import { runCleanup } from '~/server/domain/game/cleanup'

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  if (!config.gameCleanupEnabled) return { skipped: true }
  await runCleanup({
    ageDays: config.gameCleanupAgeDays,
    graceDays: config.gameCleanupGraceDays,
  })
  return { ok: true }
})