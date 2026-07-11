import type { DifficultyPreset, GameMeta, RegistryEntry } from '../../../../lib/types/game';

export interface CreateGameResult {
  token: string;
  publicToken: string;
  mcpUrl: string;
}

export type { DifficultyPreset, GameMeta, RegistryEntry };
