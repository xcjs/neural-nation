import process from 'node:process';
import { IGameCleanupService } from '../domains/game/GameModule';
import { useContainer } from '../utils/container';

export default async function gameCleanupTask() {
  const ageDays = Number(process.env.GAME_CLEANUP_AGE_DAYS) || 7;
  const graceDays = Number(process.env.GAME_CLEANUP_GRACE_DAYS) || 3;

  if (process.env.GAME_CLEANUP_ENABLED === 'false') {
    return { result: 'Cleanup disabled' };
  }

  const container = useContainer();
  const cleanupService = container.resolve(IGameCleanupService);
  const result = await cleanupService.runCleanup({ ageDays, graceDays });
  return { result: `Cleaned ${result.cleaned} games, ${result.pending} pending` };
}
