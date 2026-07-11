import type { GameDb } from '../../../db/client';
import type { ISpaceRepository } from './ISpaceRepository';
import { eq } from 'drizzle-orm';
import { schema } from '../../../db/schema';

export class SpaceRepository implements ISpaceRepository {
  constructor(private readonly db: GameDb) {}

  getAllSpaceFacilities(): Array<typeof schema.spaceFacilities.$inferSelect> {
    return this.db.select().from(schema.spaceFacilities).all();
  }

  getAllSpaceMissions(): Array<typeof schema.spaceMissions.$inferSelect> {
    return this.db.select().from(schema.spaceMissions).all();
  }

  getMetaTickCount(): number {
    const meta = this.db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get();
    return meta?.tickCount || 0;
  }

  insertSpaceMission(
    values: typeof schema.spaceMissions.$inferInsert,
  ): typeof schema.spaceMissions.$inferSelect {
    return this.db.insert(schema.spaceMissions).values(values).returning().get();
  }

  updateSpaceFacilityCrew(facilityId: number, crewCount: number): void {
    this.db
      .update(schema.spaceFacilities)
      .set({ crewAssigned: crewCount })
      .where(eq(schema.spaceFacilities.id, facilityId))
      .run();
  }

  getHumanity(): typeof schema.humanity.$inferSelect | undefined {
    return this.db.select().from(schema.humanity).where(eq(schema.humanity.key, 'global')).get();
  }

  updateHumanityAssignedToSpace(count: number): void {
    this.db
      .update(schema.humanity)
      .set({ assignedToSpace: count })
      .where(eq(schema.humanity.key, 'global'))
      .run();
  }
}
