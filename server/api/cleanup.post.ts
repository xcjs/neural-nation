import { defineEventHandler } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime/internal/config';
import { IGameCleanupService } from '../domains/game/GameModule';
import { useContainer } from '../utils/container';

export default defineEventHandler(async () => {
  const config = useRuntimeConfig();
  if (!config.gameCleanupEnabled)
    return { skipped: true };

  const container = useContainer();
  const cleanupService = container.resolve(IGameCleanupService);
  await cleanupService.runCleanup({
    ageDays: config.gameCleanupAgeDays,
    graceDays: config.gameCleanupGraceDays,
  });
  return { ok: true };
});
