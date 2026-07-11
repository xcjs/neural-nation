import type { GameDb } from '../../../db/client';
import type { FacilityRow, ITransportRepository, TerrainRow, TransportInsertValues, TransportRow } from './ITransportRepository';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '../../../db/schema';

export class TransportRepository implements ITransportRepository {
  constructor(private readonly db: GameDb) {}

  getFacilityById(id: number): FacilityRow | undefined {
    return this.db.select().from(schema.facilities).where(eq(schema.facilities.id, id)).get();
  }

  getTerrainInBoundingBox(latMin: number, latMax: number, lonMin: number, lonMax: number): TerrainRow[] {
    return this.db.select().from(schema.terrain).where(
      and(
        sql`${schema.terrain.lat} >= ${latMin} AND ${schema.terrain.lat} <= ${latMax}`,
        sql`${schema.terrain.lon} >= ${lonMin} AND ${schema.terrain.lon} <= ${lonMax}`,
      ),
    ).all();
  }

  getMetaTickCount(): number {
    const meta = this.db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get();
    return meta?.tickCount || 0;
  }

  insertTransport(values: TransportInsertValues): TransportRow {
    return this.db.insert(schema.transports).values(values).returning().get();
  }

  deleteTransport(id: number): void {
    this.db.delete(schema.transports).where(eq(schema.transports.id, id)).run();
  }

  getTransports(limit: number, offset: number): TransportRow[] {
    return this.db.select().from(schema.transports).limit(limit).offset(offset).all();
  }

  countTransports(): number {
    return this.db.select({ count: sql<number>`count(*)` })
      .from(schema.transports)
      .get()
      ?.count || 0;
  }

  updateTransportRoute(id: number, resourceKey: string, flowRate: number): void {
    this.db.update(schema.transports)
      .set({ resourceKey, flowRate })
      .where(eq(schema.transports.id, id))
      .run();
  }

  getAllFacilities(): FacilityRow[] {
    return this.db.select().from(schema.facilities).all();
  }

  getAllTransports(): TransportRow[] {
    return this.db.select().from(schema.transports).all();
  }
}
