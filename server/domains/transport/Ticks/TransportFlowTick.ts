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

      // Storage facilities hold collected resources in input buffers; fall back to input if no output buffer or it's empty
      let source = sourceBuffer;
      if (!source || source.quantity <= 0) {
        const inputBuffer = this.db.select().from(schema.facilityBuffers).where(
          and(
            eq(schema.facilityBuffers.facilityId, transport.fromFacilityId),
            eq(schema.facilityBuffers.resourceKey, transport.resourceKey),
            eq(schema.facilityBuffers.direction, 'input'),
          ),
        ).get();
        if (inputBuffer)
          source = inputBuffer;
      }

      if (!source || source.quantity <= 0)
        continue;

      const destBuffer = this.getOrCreateBuffer(transport.toFacilityId, transport.resourceKey, 'input', DEFAULT_BUFFER_CAPACITY, source.unit);

      const destSpace = destBuffer.capacity - destBuffer.quantity;
      const flowAmount = Math.min(transport.flowRate, source.quantity, destSpace);

      if (flowAmount <= 0)
        continue;

      this.db.update(schema.facilityBuffers)
        .set({ quantity: source.quantity - flowAmount })
        .where(eq(schema.facilityBuffers.id, source.id))
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
