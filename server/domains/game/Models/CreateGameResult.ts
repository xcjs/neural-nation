import type { GameMeta, RegistryEntry } from '../../../../lib/types/game';

export interface CreateGameResult {
  token: string;
  publicToken: string;
  mcpUrl: string;
}

export type { GameMeta, RegistryEntry };
