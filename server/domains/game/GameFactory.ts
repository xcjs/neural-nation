import type { GameDb } from '../../db/client';
import type { CreateGameResult } from './Models/CreateGameResult';
import { copyFileSync, existsSync } from 'node:fs';
import { WorldDefaults } from '../../../lib/constants/difficulty';
import { GameStatus, type RegistryEntry } from '../../../lib/types/game';
import { schema } from '../../db/schema';
import { createGameDb, getGameDbPath, getTemplateDbPath } from '../db/DbFactory';
import { addToRegistry, ensureDataDir } from './GameRegistry';
import { generateTokenPair } from './GameToken';
import { buildMcpUrl } from './McpUrlBuilder';

export class GameFactory {
  createGame(): CreateGameResult {
    const { token, publicToken } = generateTokenPair();

    ensureDataDir();

    const templatePath = getTemplateDbPath();
    if (!existsSync(templatePath))
      throw new Error('Template database not found. Run build-template script first.');

    const gameDbPath = getGameDbPath(token);
    copyFileSync(templatePath, gameDbPath);

    const db = createGameDb(token);
    const now = new Date().toISOString();

    db.insert(schema.meta).values({
      key: 'game',
      token,
      publicToken,
      createdAt: now,
      lastActiveAt: now,
      lastTickAt: null,
      tickCount: 0,
      status: 'Active',
      difficulty: 'Normal',
      cleanupEligibleAt: null,
    }).run();

    this.seedStartingResources(db);
    this.seedStartingPopulation(db);

    const entry: RegistryEntry = {
      token,
      publicToken,
      createdAt: now,
      lastActive: now,
      status: GameStatus.Active,
      cleanupEligibleAt: null,
    };
    addToRegistry(entry);

    return { token, publicToken, mcpUrl: buildMcpUrl(token) };
  }

  private seedStartingResources(db: GameDb): void {
    for (const resource of WorldDefaults.startingResources) {
      db.insert(schema.stockpiles).values({
        resourceKey: resource.resourceKey,
        facilityId: null,
        quantity: resource.quantity,
        capacity: resource.quantity * 10,
        unit: resource.unit,
      }).run();
    }
  }

  private seedStartingPopulation(db: GameDb): void {
    db.insert(schema.humanity).values({
      key: 'global',
      population: WorldDefaults.population,
      growthRate: WorldDefaults.growthRate,
      welfare: 100,
      foodSatisfaction: 100,
      energySatisfaction: 100,
      assignedToSpace: 0,
    }).run();

    db.insert(schema.environment).values({
      key: 'global',
      pollutionLevel: 0,
      forestCoverage: 100,
      waterQuality: 100,
      biodiversity: 100,
    }).run();
  }
}
