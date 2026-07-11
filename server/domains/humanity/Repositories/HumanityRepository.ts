import type { GameDb } from '../../../db/client';
import type { IHumanityRepository } from './IHumanityRepository';
import { eq, sql } from 'drizzle-orm';
import { schema } from '../../../db/schema';

export class HumanityRepository implements IHumanityRepository {
  constructor(private readonly db: GameDb) {}

  getHumanity(): typeof schema.humanity.$inferSelect | undefined {
    return this.db.select().from(schema.humanity).where(eq(schema.humanity.key, 'global')).get();
  }

  getEnvironment(): typeof schema.environment.$inferSelect | undefined {
    return this.db.select().from(schema.environment).where(eq(schema.environment.key, 'global')).get();
  }

  getIncidents(limit: number, offset: number): Array<typeof schema.incidents.$inferSelect> {
    return this.db.select().from(schema.incidents).limit(limit).offset(offset).all();
  }

  countIncidents(): number {
    return this.db.select({ count: sql<number>`count(*)` })
      .from(schema.incidents)
      .get()
      ?.count || 0;
  }
}
