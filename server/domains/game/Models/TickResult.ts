import type { GameStatus } from '../../../../lib/types/game';

export interface TickResult {
  tickCount: number;
  status: GameStatus;
  advanced: boolean;
}
