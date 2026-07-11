import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '../../../db/schema';

const DEFAULT_BUFFER_CAPACITY = 100;

export class TransportFlowTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(_tick: number): void {
    const transports = this.db.select().from(schema.transports).where(sql`${schema.transports.flowRate} > 0`).all();

    for (const transport of transports) {
      if (!transport.resourceKey)
        continue;

      const sourceBuffer = this.db.select().from(schema.facilityBuffers).where(
        and(
          eq(schema.facilityBuffers.facilityId, transport.fromFacilityId),
          eq(schema.facilityBuffers.resourceKey, transport.resourceKey),
          eq(schema.facilityBuffers.direction, 'output'),
        ),
      ).get();

      if (!sourceBuffer || sourceBuffer.quantity <= 0)
        continue;

      const destBuffer = this.getOrCreateBuffer(transport.toFacilityId, transport.resourceKey, 'input', DEFAULT_BUFFER_CAPACITY, sourceBuffer.unit);

      const destSpace = destBuffer.capacity - destBuffer.quantity;
      const flowAmount = Math.min(transport.flowRate, sourceBuffer.quantity, destSpace);

      if (flowAmount <= 0)
        continue;

      this.db.update(schema.facilityBuffers)
        .set({ quantity: sourceBuffer.quantity - flowAmount })
        .where(eq(schema.facilityBuffers.id, sourceBuffer.id))
        .run();

      this.db.update(schema.facilityBuffers)
        .set({ quantity: destBuffer.quantity + flowAmount })
        .where(eq(schema.facilityBuffers.id, destBuffer.id))
        .run();
    }
  }

  private getOrCreateBuffer(
    facilityId: number,
    resourceKey: string,
    direction: 'input' | 'output',
    capacity: number,
    unit: string,
  ): typeof schema.facilityBuffers.$inferSelect {
    const existing = this.db.select().from(schema.facilityBuffers).where(
      and(
        eq(schema.facilityBuffers.facilityId, facilityId),
        eq(schema.facilityBuffers.resourceKey, resourceKey),
        eq(schema.facilityBuffers.direction, direction),
      ),
    ).get();

    if (existing)
      return existing;

    return this.db.insert(schema.facilityBuffers).values({
      facilityId,
      resourceKey,
      quantity: 0,
      capacity,
      unit,
      direction,
    }).returning().get();
  }
}
