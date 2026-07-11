import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { and, eq, sql } from 'drizzle-orm';
import { GameStatus } from '../../../../lib/types/game';
import { schema } from '../../../db/schema';

const EXTRACTOR_TYPES = new Set(['Extractor', 'Farm', 'Forestry', 'WaterPump', 'Excavator', 'Dredger']);

export class LoseConditionTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(_tick: number): void {
    if (this.checkLoseCondition()) {
      this.db.update(schema.meta)
        .set({ status: GameStatus.GameOver })
        .where(eq(schema.meta.key, 'game'))
        .run();
    }
  }

  private checkLoseCondition(): boolean {
    const stockpiles = this.db.select().from(schema.stockpiles).all();

    if (stockpiles.length === 0)
      return true;

    const nonEmptyStockpiles = stockpiles.filter(s => s.quantity > 0);
    const activeFacilities = this.db.select()
      .from(schema.facilities)
      .where(eq(schema.facilities.status, 'Active'))
      .all();

    if (nonEmptyStockpiles.length === 0 && activeFacilities.length === 0)
      return true;

    const humanity = this.db.select().from(schema.humanity).where(eq(schema.humanity.key, 'global')).get();
    if (humanity && humanity.population <= 0)
      return true;

    if (nonEmptyStockpiles.length === 0 && activeFacilities.length > 0) {
      const nonRenewableDeposits = this.db.select().from(schema.resources).where(
        and(
          eq(schema.resources.category, 'NonRenewable'),
          sql`${schema.resources.remaining} > 0`,
        ),
      ).all();

      const renewableResources = this.db.select().from(schema.resources).where(
        and(
          eq(schema.resources.category, 'Renewable'),
          sql`${schema.resources.remaining} > 0`,
        ),
      ).all();

      const extractingFacilities = activeFacilities.filter(f =>
        EXTRACTOR_TYPES.has(f.type),
      );

      if (nonRenewableDeposits.length === 0 && renewableResources.length === 0 && extractingFacilities.length > 0)
        return true;
    }

    return false;
  }
}
