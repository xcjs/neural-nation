import type { GameDb } from '../../../db/client';
import type { ITerrainRepository } from './ITerrainRepository';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '../../../db/schema';

export class TerrainRepository implements ITerrainRepository {
  constructor(private readonly db: GameDb) {}

  getTerrainCellNear(lat: number, lon: number): typeof schema.terrain.$inferSelect | undefined {
    return this.db.select().from(schema.terrain).where(
      and(
        sql`abs(${schema.terrain.lat} - ${lat}) <= 0.5`,
        sql`abs(${schema.terrain.lon} - ${lon}) <= 0.5`,
      ),
    ).get();
  }

  getTerrainCellByIndex(latIndex: number, lonIndex: number): typeof schema.terrain.$inferSelect | undefined {
    return this.db.select().from(schema.terrain).where(
      and(
        eq(schema.terrain.latIndex, latIndex),
        eq(schema.terrain.lonIndex, lonIndex),
      ),
    ).get();
  }

  getTerrainModificationsForCell(latIndex: number, lonIndex: number): Array<typeof schema.terrainModifications.$inferSelect> {
    return this.db.select().from(schema.terrainModifications).where(
      and(
        eq(schema.terrainModifications.latIndex, latIndex),
        eq(schema.terrainModifications.lonIndex, lonIndex),
      ),
    ).all();
  }

  getTerrainInBoundingBox(latMin: number, latMax: number, lonMin: number, lonMax: number): Array<typeof schema.terrain.$inferSelect> {
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

  insertTerrainModification(values: typeof schema.terrainModifications.$inferInsert): void {
    this.db.insert(schema.terrainModifications).values(values).run();
  }

  getTerrainModifications(limit: number, offset: number): Array<typeof schema.terrainModifications.$inferSelect> {
    return this.db.select().from(schema.terrainModifications).limit(limit).offset(offset).all();
  }

  countTerrainModifications(): number {
    return this.db.select({ count: sql<number>`count(*)` })
      .from(schema.terrainModifications)
      .get()
      ?.count || 0;
  }

  getStockpile(resourceKey: string): typeof schema.stockpiles.$inferSelect | undefined {
    return this.db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, resourceKey)).get();
  }

  decrementStockpile(stockpileId: number, quantity: number): void {
    this.db.update(schema.stockpiles)
      .set({ quantity })
      .where(eq(schema.stockpiles.id, stockpileId))
      .run();
  }
}
