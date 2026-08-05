import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '../../../db/schema';
import { logGameEvent } from '../../events/logGameEvent';

const TRANSFER_RATE = 10;

export class StorageBridgeTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(tick: number): void {
    const storageFacilities = this.db.select().from(schema.facilities).where(
      and(
        eq(schema.facilities.type, 'Storage'),
        eq(schema.facilities.status, 'Active'),
      ),
    ).all();

    for (const storage of storageFacilities) {
      const inputBuffers = this.db.select().from(schema.facilityBuffers).where(
        and(
          eq(schema.facilityBuffers.facilityId, storage.id),
          eq(schema.facilityBuffers.direction, 'input'),
        ),
      ).all();

      for (const buffer of inputBuffers) {
        if (buffer.quantity <= 0)
          continue;

        const transferAmount = Math.min(TRANSFER_RATE, buffer.quantity);
        const stockpile = this.getOrCreateGlobalStockpile(buffer.resourceKey, buffer.unit);

        const stockpileSpace = stockpile.capacity - stockpile.quantity;
        const actualTransfer = Math.min(transferAmount, stockpileSpace);

        if (actualTransfer <= 0)
          continue;

        this.db.update(schema.facilityBuffers)
          .set({ quantity: buffer.quantity - actualTransfer })
          .where(eq(schema.facilityBuffers.id, buffer.id))
          .run();

        this.db.update(schema.stockpiles)
          .set({ quantity: stockpile.quantity + actualTransfer })
          .where(eq(schema.stockpiles.id, stockpile.id))
          .run();

        logGameEvent(
          this.db,
          tick,
          'storage_collection',
          `Storage '${storage.name}' transferred ${actualTransfer} ${buffer.unit} of ${buffer.resourceKey} to global stockpile`,
          'info',
          storage.id,
        );
      }
    }
  }

  private getOrCreateGlobalStockpile(resourceKey: string, unit: string): typeof schema.stockpiles.$inferSelect {
    const existing = this.db.select().from(schema.stockpiles).where(
      and(
        eq(schema.stockpiles.resourceKey, resourceKey),
        sql`${schema.stockpiles.facilityId} IS NULL`,
      ),
    ).get();

    if (existing)
      return existing;

    return this.db.insert(schema.stockpiles).values({
      resourceKey,
      facilityId: null,
      quantity: 0,
      capacity: 100000,
      unit,
    }).returning().get();
  }
}
