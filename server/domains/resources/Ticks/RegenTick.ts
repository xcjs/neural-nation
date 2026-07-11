import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { sql } from 'drizzle-orm';
import { schema } from '../../../db/schema';

export class RegenTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(_tick: number): void {
    this.db.update(schema.resources)
      .set({
        remaining: sql`${schema.resources.remaining} + ${schema.resources.remaining} * 0.0001`,
      })
      .where(
        sql`${schema.resources.surface} = 1 AND ${schema.resources.remaining} < ${schema.resources.quantity}`,
      )
      .run();
  }
}
