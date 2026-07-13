import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime';
import { IGameCleanupService } from '../domains/game/GameModule';
import { useContainer } from '../utils/container';

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig();
  if (!config.gameCleanupEnabled)
    return;

  const runCleanup = async () => {
    const container = useContainer();
    const cleanupService = container.resolve(IGameCleanupService);
    const result = await cleanupService.runCleanup({
      ageDays: config.gameCleanupAgeDays,
      graceDays: config.gameCleanupGraceDays,
    });
    if (result.cleaned > 0 || result.pending > 0)
      console.warn(`[cleanup] Cleaned ${result.cleaned} games, ${result.pending} pending`);
  };

  const intervalMs = (config.gameCleanupIntervalHours || 6) * 60 * 60 * 1000;

  // Run once shortly after startup, then on interval
  setTimeout(runCleanup, 10_000);
  setInterval(runCleanup, intervalMs);
});
