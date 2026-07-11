import type { GameDb } from '../../../db/client';
import type { BuildFacilityParams, FacilityBufferRow, FacilityRow, IFacilityRepository, RecipeRow, SearchFacilitiesParams, StockpileRow } from './IFacilityRepository';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '../../../db/schema';

export class FacilityRepository implements IFacilityRepository {
  constructor(private readonly db: GameDb) {}

  getTick(): number {
    const meta = this.db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get();
    return meta?.tickCount || 0;
  }

  getCompletedTechIds(): string[] {
    return this.db.select().from(schema.gameResearch).where(eq(schema.gameResearch.status, 'Completed')).all().map(r => r.techId);
  }

  getAllFacilities(): FacilityRow[] {
    return this.db.select().from(schema.facilities).all() as FacilityRow[];
  }

  getFacilityById(id: number): FacilityRow | undefined {
    return this.db.select().from(schema.facilities).where(eq(schema.facilities.id, id)).get() as FacilityRow | undefined;
  }

  getFacilityBuffers(facilityId: number): FacilityBufferRow[] {
    return this.db.select().from(schema.facilityBuffers).where(eq(schema.facilityBuffers.facilityId, facilityId)).all() as FacilityBufferRow[];
  }

  getBufferFacilityIds(resourceKey: string, direction: string): number[] {
    return this.db.select().from(schema.facilityBuffers).where(
      and(
        eq(schema.facilityBuffers.resourceKey, resourceKey),
        eq(schema.facilityBuffers.direction, direction),
      ),
    ).all().map(b => b.facilityId);
  }

  getStockpile(resourceKey: string): StockpileRow | undefined {
    return this.db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, resourceKey)).get() as StockpileRow | undefined;
  }

  decrementStockpile(stockpileId: number, quantity: number): void {
    this.db.update(schema.stockpiles)
      .set({ quantity })
      .where(eq(schema.stockpiles.id, stockpileId))
      .run();
  }

  getRecipe(recipeId: string): RecipeRow | undefined {
    return this.db.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId)).get() as RecipeRow | undefined;
  }

  insertFacility(params: BuildFacilityParams): FacilityRow {
    return this.db.insert(schema.facilities).values({
      type: params.type,
      name: params.name,
      lat: params.lat,
      lon: params.lon,
      status: params.status,
      techRequired: params.techRequired,
      activeRecipeId: null,
      targetOutputRate: 0,
      powerConsumption: 0,
      powerConnected: params.powerConnected,
      throughput: 0,
      constructionProgress: 0,
      elevation: 0,
      terrainClass: 'Plain',
      footprint: params.footprint,
      createdAtTick: params.createdAtTick,
    }).returning().get() as FacilityRow;
  }

  deleteFacility(id: number): void {
    this.db.delete(schema.facilities).where(eq(schema.facilities.id, id)).run();
  }

  deleteFacilityBuffers(id: number): void {
    this.db.delete(schema.facilityBuffers).where(eq(schema.facilityBuffers.facilityId, id)).run();
  }

  updateProductionTarget(facilityId: number, recipeId: string, targetRate: number): void {
    this.db.update(schema.facilities)
      .set({
        activeRecipeId: recipeId,
        targetOutputRate: targetRate,
      })
      .where(eq(schema.facilities.id, facilityId))
      .run();
  }

  listFacilities(limit: number, offset: number): { items: FacilityRow[]; totalCount: number } {
    const items = this.db.select().from(schema.facilities).limit(limit).offset(offset).all() as FacilityRow[];
    const totalCount = this.db.select({ count: sql<number>`count(*)` })
      .from(schema.facilities)
      .get()
      ?.count || 0;
    return { items, totalCount };
  }

  searchFacilities(params: SearchFacilitiesParams): { items: FacilityRow[]; totalCount: number } {
    let queryBuilder = this.db.select().from(schema.facilities).$dynamic();
    const conditions = [];

    if (params.type) {
      conditions.push(eq(schema.facilities.type, params.type));
    }

    if (params.status) {
      conditions.push(eq(schema.facilities.status, params.status));
    }

    if (params.producesResource) {
      const facilityIds = this.db.select().from(schema.facilityBuffers).where(
        and(
          eq(schema.facilityBuffers.resourceKey, params.producesResource),
          eq(schema.facilityBuffers.direction, 'output'),
        ),
      ).all().map(b => b.facilityId);
      if (facilityIds.length > 0) {
        conditions.push(sql`${schema.facilities.id} IN (${sql.join(facilityIds.map(id => sql`${id}`), sql`,`)})`);
      }
      else {
        conditions.push(sql`1=0`);
      }
    }

    if (params.consumesResource) {
      const facilityIds = this.db.select().from(schema.facilityBuffers).where(
        and(
          eq(schema.facilityBuffers.resourceKey, params.consumesResource),
          eq(schema.facilityBuffers.direction, 'input'),
        ),
      ).all().map(b => b.facilityId);
      if (facilityIds.length > 0) {
        conditions.push(sql`${schema.facilities.id} IN (${sql.join(facilityIds.map(id => sql`${id}`), sql`,`)})`);
      }
      else {
        conditions.push(sql`1=0`);
      }
    }

    if (conditions.length > 0) {
      queryBuilder = queryBuilder.where(and(...conditions));
    }

    const items = queryBuilder.limit(params.limit ?? 50).offset(params.offset ?? 0).all() as FacilityRow[];

    const countQuery = this.db.select({ count: sql<number>`count(*)` })
      .from(schema.facilities)
      .$dynamic();
    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }
    const totalCount = countQuery.get()?.count || 0;

    return { items, totalCount };
  }
}
