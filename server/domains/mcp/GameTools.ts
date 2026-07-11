import type { IDbConnection } from '../db/IDbConnection';
import type { IGameRepository } from '../game/Repositories/IGameRepository';
import type { HumanityService } from '../humanity/HumanityService';
import type { IToolRegistry } from './IToolRegistry';
import { desc, eq, sql } from 'drizzle-orm';
import { schema } from '../../db/schema';

export class GameTools {
  constructor(
    private readonly dbConnection: IDbConnection,
    private readonly gameRepo: IGameRepository,
    private readonly humanityService: HumanityService,
  ) {}

  register(registry: IToolRegistry): void {
    registry.register('get_game_state', {
      name: 'get_game_state',
      description: 'Get high-level game state summary: tick, status, resource counts, facility counts, population, power summary.',
      inputSchema: { type: 'object', properties: {} },
    }, () => {
      return this.getGameState();
    });

    registry.register('get_event_log', {
      name: 'get_event_log',
      description: 'Get the event log. Paginated, newest first.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
          offset: { type: 'number' },
        },
      },
    }, (args) => {
      const db = this.dbConnection.getDb();
      const limit = Math.min((args.limit as number) || 50, 200);
      const offset = (args.offset as number) || 0;
      const items = db.select().from(schema.events).orderBy(desc(schema.events.id)).limit(limit).offset(offset).all();
      const countRow = db.select({ count: sql<number>`count(*)` }).from(schema.events).get();
      return { items, totalCount: countRow?.count ?? items.length, limit, offset };
    });

    registry.register('get_incidents', {
      name: 'get_incidents',
      description: 'Get environmental incidents log. Paginated.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number' }, offset: { type: 'number' } },
      },
    }, (args) => {
      return this.humanityService.getIncidents({ limit: args.limit as number, offset: args.offset as number });
    });
  }

  getGameState(): {
    tick: number | null;
    status: string;
    difficulty: string;
    createdAt: string;
    facilityCount: number;
    transportCount: number;
    population: number;
    pollutionLevel: number;
    forestCoverage: number;
    waterQuality: number;
    biodiversity: number;
  } {
    const db = this.dbConnection.getDb();
    const meta = this.gameRepo.getMeta();
    if (!meta)
      throw new Error('Game not found');

    const facilityCount = db.select().from(schema.facilities).all().length;
    const transportCount = db.select().from(schema.transports).all().length;
    const human = db.select().from(schema.humanity).where(eq(schema.humanity.key, 'global')).get();
    const env = db.select().from(schema.environment).where(eq(schema.environment.key, 'global')).get();

    return {
      tick: meta.tickCount ?? null,
      status: meta.status,
      difficulty: meta.difficulty,
      createdAt: meta.createdAt,
      facilityCount,
      transportCount,
      population: human?.population || 0,
      pollutionLevel: env?.pollutionLevel || 0,
      forestCoverage: env?.forestCoverage || 0,
      waterQuality: env?.waterQuality || 0,
      biodiversity: env?.biodiversity || 0,
    };
  }
}
