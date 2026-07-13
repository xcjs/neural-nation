import type { GameMeta, RegistryEntry } from '../../../lib/types/game';
import type { GameFactory } from './GameFactory';
import type { CreateGameResult } from './Models/CreateGameResult';
import type { IGameRepository } from './Repositories/IGameRepository';
import { existsSync, renameSync, unlinkSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { schema } from '../../db/schema';
import { createGameDb, getGameDbPath } from '../db/DbFactory';
import { addToRegistry, findRegistryEntry, removeFromRegistry, updateRegistryEntry } from './GameRegistry';
import { generateTokenPair } from './GameToken';
import { buildMcpUrl } from './McpUrlBuilder';

export class GameService {
  constructor(
    private readonly gameRepo: IGameRepository,
    private readonly gameFactory: GameFactory,
  ) {}

  createGame(origin?: string): CreateGameResult {
    return this.gameFactory.createGame(origin);
  }

  getGameMeta(): GameMeta | undefined {
    return this.gameRepo.getMeta();
  }

  updateLastActive(): void {
    this.gameRepo.updateLastActive(new Date().toISOString());
  }

  updateLastActiveInRegistry(token: string): void {
    updateRegistryEntry(token, { lastActive: new Date().toISOString() });
  }

  revokeToken(token: string): { success: boolean } {
    const entry = findRegistryEntry(token);
    if (!entry)
      throw new Error('Game not found');

    const basePath = getGameDbPath(token);
    for (const ext of ['', '-wal', '-shm']) {
      const filePath = `${basePath}${ext}`;
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        }
        catch { /* ignore */ }
      }
    }
    removeFromRegistry(token);
    return { success: true };
  }

  mintNewToken(oldToken: string, origin?: string): { token: string; publicToken: string; mcpUrl: string } {
    const entry = findRegistryEntry(oldToken);
    if (!entry)
      throw new Error('Game not found');

    const { token: newToken, publicToken: newPublicToken } = generateTokenPair();
    const oldDbPath = getGameDbPath(oldToken);
    const newDbPath = getGameDbPath(newToken);

    renameSync(oldDbPath, newDbPath);
    for (const ext of ['-wal', '-shm']) {
      if (existsSync(`${oldDbPath}${ext}`)) {
        try {
          renameSync(`${oldDbPath}${ext}`, `${newDbPath}${ext}`);
        }
        catch { /* ignore */ }
      }
    }

    const db = createGameDb(newToken);
    db.update(schema.meta)
      .set({ token: newToken, publicToken: newPublicToken })
      .where(eq(schema.meta.key, 'game'))
      .run();

    removeFromRegistry(oldToken);
    const now = new Date().toISOString();
    const newEntry: RegistryEntry = {
      token: newToken,
      publicToken: newPublicToken,
      createdAt: entry.createdAt,
      lastActive: now,
      status: entry.status,
      cleanupEligibleAt: entry.cleanupEligibleAt,
    };
    addToRegistry(newEntry);

    return { token: newToken, publicToken: newPublicToken, mcpUrl: buildMcpUrl(newToken, origin) };
  }
}
