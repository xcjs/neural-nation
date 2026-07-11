import type { GameDb } from '../../db/client';
import type { CreateGameResult } from './Models/CreateGameResult';
import { copyFileSync, existsSync } from 'node:fs';
import { DifficultyConfigs } from '../../../lib/constants/difficulty';
import { type DifficultyPreset, GameStatus, type RegistryEntry } from '../../../lib/types/game';
import { schema } from '../../db/schema';
import { createGameDb, getGameDbPath, getTemplateDbPath } from '../db/DbFactory';
import { addToRegistry, ensureDataDir } from './GameRegistry';
import { generateTokenPair } from './GameToken';
import { buildMcpUrl } from './McpUrlBuilder';

export class GameFactory {
  createGame(difficulty: DifficultyPreset): CreateGameResult {
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
      difficulty,
      cleanupEligibleAt: null,
    }).run();

    this.seedStartingResources(db, difficulty);
    this.seedStartingPopulation(db, difficulty);

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

  private seedStartingResources(db: GameDb, difficulty: DifficultyPreset): void {
    const config = DifficultyConfigs[difficulty];
    for (const resource of config.startingResources) {
      const quantity = this.randomInRange(resource.min, resource.max);
      db.insert(schema.stockpiles).values({
        resourceKey: resource.resourceKey,
        facilityId: null,
        quantity,
        capacity: quantity * 10,
        unit: resource.unit,
      }).run();
    }
  }

  private seedStartingPopulation(db: GameDb, difficulty: DifficultyPreset): void {
    const config = DifficultyConfigs[difficulty];
    const population = this.randomInRange(config.populationRange.min, config.populationRange.max);

    db.insert(schema.humanity).values({
      key: 'global',
      population,
      growthRate: 0.0005,
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

  private randomInRange(min: number, max: number): number {
    return Math.round(min + Math.random() * (max - min));
  }
}
