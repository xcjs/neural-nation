import type { GameMeta } from '../../../../lib/types/game';
import type { GameDb } from '../../../db/client';
import type { IGameRepository } from './IGameRepository';
import { eq } from 'drizzle-orm';
import { schema } from '../../../db/schema';

export class GameRepository implements IGameRepository {
  constructor(private readonly db: GameDb) {}

  getMeta(): GameMeta | undefined {
    return this.db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get() as GameMeta | undefined;
  }

  updateTick(tickCount: number, now: string): void {
    this.db.update(schema.meta)
      .set({ tickCount, lastTickAt: now, lastActiveAt: now })
      .where(eq(schema.meta.key, 'game'))
      .run();
  }

  updateLastActive(now: string): void {
    this.db.update(schema.meta)
      .set({ lastActiveAt: now })
      .where(eq(schema.meta.key, 'game'))
      .run();
  }

  setStatus(status: string): void {
    this.db.update(schema.meta)
      .set({ status })
      .where(eq(schema.meta.key, 'game'))
      .run();
  }

  setToken(token: string, publicToken: string): void {
    this.db.update(schema.meta)
      .set({ token, publicToken })
      .where(eq(schema.meta.key, 'game'))
      .run();
  }

  insertMeta(meta: Omit<typeof schema.meta.$inferInsert, 'id'>): void {
    this.db.insert(schema.meta).values(meta).run();
  }
}
