import type { IDbConnection } from '../db/IDbConnection';
import type { TickResult } from '../game/Models/TickResult';
import type { IGameRepository } from '../game/Repositories/IGameRepository';
import { eq } from 'drizzle-orm';
import { GameStatus } from '../../../lib/types/game';
import { schema } from '../../db/schema';
import { ConstructionTick } from '../facilities/Ticks/ConstructionTick';
import { ProductionTick } from '../facilities/Ticks/ProductionTick';
import { LoseConditionTick } from '../game/Ticks/LoseConditionTick';
import { EnvironmentTick } from '../humanity/Ticks/EnvironmentTick';
import { ForestGridTick } from '../humanity/Ticks/ForestGridTick';
import { PopulationTick } from '../humanity/Ticks/PopulationTick';
import { RegenTick } from '../resources/Ticks/RegenTick';
import { ResearchTick } from '../tech/Ticks/ResearchTick';
import { TransportFlowTick } from '../transport/Ticks/TransportFlowTick';

export class TickProcessor {
  constructor(
    private readonly gameRepo: IGameRepository,
    private readonly dbConnection: IDbConnection,
  ) {}

  process(): TickResult {
    const meta = this.gameRepo.getMeta();
    if (!meta)
      throw new Error('Game not found');

    if (meta.status === GameStatus.GameOver || meta.status === GameStatus.Paused) {
      return {
        tickCount: meta.tickCount ?? 0,
        status: meta.status as GameStatus,
        advanced: false,
      };
    }

    const newTick = (meta.tickCount ?? 0) + 1;
    const now = new Date().toISOString();

    const db = this.dbConnection.getDb();

    db.transaction((tx) => {
      tx.update(schema.meta)
        .set({
          tickCount: newTick,
          lastTickAt: now,
          lastActiveAt: now,
        })
        .where(eq(schema.meta.key, 'game'))
        .run();

      new RegenTick(tx).process(newTick);
      new PopulationTick(tx).process(newTick);
      new EnvironmentTick(tx).process(newTick);
      new ForestGridTick(tx).process(newTick);
      new ConstructionTick(tx).process(newTick);
      new ProductionTick(tx).process(newTick);
      new TransportFlowTick(tx).process(newTick);
      new ResearchTick(tx).process(newTick);
      new LoseConditionTick(tx).process(newTick);
    });

    const updatedMeta = this.gameRepo.getMeta();

    return {
      tickCount: newTick,
      status: (updatedMeta?.status as GameStatus) || GameStatus.Active,
      advanced: true,
    };
  }
}
