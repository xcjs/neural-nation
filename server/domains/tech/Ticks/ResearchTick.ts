import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { eq } from 'drizzle-orm';
import { schema } from '../../../db/schema';

export class ResearchTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(tick: number): void {
    const activeResearch = this.db.select()
      .from(schema.gameResearch)
      .where(eq(schema.gameResearch.status, 'InProgress'))
      .all();

    for (const research of activeResearch) {
      const newProgress = research.progress + 1;
      const techNode = this.db.select()
        .from(schema.techNodes)
        .where(eq(schema.techNodes.id, research.techId))
        .get();

      if (techNode && newProgress >= techNode.researchTime) {
        this.db.update(schema.gameResearch)
          .set({
            status: 'Completed',
            progress: newProgress,
            completedAtTick: tick,
          })
          .where(eq(schema.gameResearch.id, research.id))
          .run();
      }
      else {
        this.db.update(schema.gameResearch)
          .set({ progress: newProgress })
          .where(eq(schema.gameResearch.id, research.id))
          .run();
      }
    }
  }
}
