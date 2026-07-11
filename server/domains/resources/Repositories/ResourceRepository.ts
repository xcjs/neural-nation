import type { PaginatedResult } from '../../../../lib/types/mcp';
import type { GameDb } from '../../../db/client';
import type { IResourceRepository } from './IResourceRepository';
import { and, eq, like, sql } from 'drizzle-orm';
import { schema } from '../../../db/schema';

type DepositRow = typeof schema.resources.$inferSelect;
type StockpileRow = typeof schema.stockpiles.$inferSelect;

export class ResourceRepository implements IResourceRepository {
  constructor(private readonly db: GameDb) {}

  findUndiscoveredDepositsWithinRadius(lat: number, lon: number, radius: number): DepositRow[] {
    return this.db.select().from(schema.resources).where(
      and(
        sql`${schema.resources.discovered} = 0`,
        sql`abs(${schema.resources.lat} - ${lat}) <= ${radius}`,
        sql`abs(${schema.resources.lon} - ${lon}) <= ${radius}`,
      ),
    ).all();
  }

  markDepositDiscovered(id: number): void {
    this.db.update(schema.resources)
      .set({ discovered: 1 })
      .where(eq(schema.resources.id, id))
      .run();
  }

  getGameTick(): number {
    const meta = this.db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get();
    return meta?.tickCount || 0;
  }

  insertSurveyLog(log: { tick: number; timestamp: string; lat: number; lon: number; radius: number; depositsFound: number }): void {
    this.db.insert(schema.surveyLog).values(log).run();
  }

  getDiscoveredDeposits(limit: number, offset: number): DepositRow[] {
    return this.db.select().from(schema.resources).where(eq(schema.resources.discovered, 1)).limit(limit).offset(offset).all();
  }

  countDiscoveredDeposits(): number {
    return this.db.select({ count: sql<number>`count(*)` })
      .from(schema.resources)
      .where(eq(schema.resources.discovered, 1))
      .get()
      ?.count || 0;
  }

  getAllDeposits(): DepositRow[] {
    return this.db.select().from(schema.resources).all();
  }

  getAllStockpiles(): StockpileRow[] {
    return this.db.select().from(schema.stockpiles).all();
  }

  getDepositsByResourceKey(resourceKey: string): DepositRow[] {
    return this.db.select().from(schema.resources).where(eq(schema.resources.resourceKey, resourceKey)).all();
  }

  getStockpilesByResourceKey(resourceKey: string): StockpileRow[] {
    return this.db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, resourceKey)).all();
  }

  getStockpiles(resourceKey?: string): StockpileRow[] {
    const query = resourceKey
      ? this.db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, resourceKey))
      : this.db.select().from(schema.stockpiles);
    return query.all();
  }

  findRecipeInputResourceKeysByRecipeId(recipeId: string): string[] {
    return this.db.select().from(schema.recipeInputs).where(eq(schema.recipeInputs.recipeId, recipeId)).all().map(i => i.resourceKey);
  }

  findRecipeOutputResourceKeysByRecipeId(recipeId: string): string[] {
    return this.db.select().from(schema.recipeOutputs).where(eq(schema.recipeOutputs.recipeId, recipeId)).all().map(o => o.resourceKey);
  }

  findRecipeIdsByFacilityType(facilityType: string): string[] {
    return this.db.select().from(schema.recipes).where(eq(schema.recipes.facilityType, facilityType)).all().map(r => r.id);
  }

  findRecipeInputResourceKeysByRecipeIds(recipeIds: string[]): string[] {
    if (recipeIds.length === 0)
      return [];
    return this.db.select().from(schema.recipeInputs).all().filter(i => recipeIds.includes(i.recipeId)).map(i => i.resourceKey);
  }

  findTechCostResourceKeysByTechId(techId: string): string[] {
    return this.db.select().from(schema.techCosts).where(eq(schema.techCosts.techId, techId)).all().map(c => c.resourceKey);
  }

  searchResources(params: {
    query?: string;
    category?: string;
    resourceKeys?: string[];
    limit?: number;
    offset?: number;
  }): PaginatedResult<{ resourceKey: string; name: string; category: string }> {
    const limit = Math.min(params.limit || 50, 200);
    const offset = Math.max(params.offset || 0, 0);

    let queryBuilder = this.db.select({
      resourceKey: schema.resources.resourceKey,
      name: schema.resources.name,
      category: schema.resources.category,
    }).from(schema.resources).$dynamic();

    const conditions = [];

    if (params.query) {
      conditions.push(like(schema.resources.name, `%${params.query}%`));
    }

    if (params.category) {
      conditions.push(eq(schema.resources.category, params.category));
    }

    if (params.resourceKeys && params.resourceKeys.length > 0) {
      conditions.push(sql`${schema.resources.resourceKey} IN (${sql.join(params.resourceKeys.map(k => sql`${k}`), sql`,`)})`);
    }

    if (conditions.length > 0) {
      queryBuilder = queryBuilder.where(and(...conditions));
    }

    const items = queryBuilder.limit(limit).offset(offset).all();

    const countQuery = this.db.select({ count: sql<number>`count(distinct ${schema.resources.resourceKey})` })
      .from(schema.resources)
      .$dynamic();
    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }
    const totalCount = countQuery.get()?.count || 0;

    return {
      items,
      totalCount,
      limit,
      offset,
      hasMore: offset + items.length < totalCount,
    };
  }
}
