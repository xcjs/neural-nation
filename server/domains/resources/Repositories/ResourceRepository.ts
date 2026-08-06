import type { PaginatedResult } from '../../../../lib/types/mcp';
import type { GameDb } from '../../../db/client';
import type { IResourceRepository } from './IResourceRepository';
import { and, asc, eq, sql } from 'drizzle-orm';
import { ELEMENT_BY_SYMBOL } from '../../../../lib/constants/elements';
import { NON_ELEMENT_NAMES } from '../../../../lib/constants/resource-names';
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
    return this.db.select().from(schema.resources).where(eq(schema.resources.discovered, 1)).orderBy(asc(schema.resources.id)).limit(limit).offset(offset).all();
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

    const depositItems = this.db.select({
      resourceKey: schema.resources.resourceKey,
      name: schema.resources.name,
      category: schema.resources.category,
    }).from(schema.resources).groupBy(schema.resources.resourceKey).all();

    const recipeOutputKeys = this.db.select({
      resourceKey: schema.recipeOutputs.resourceKey,
    }).from(schema.recipeOutputs).groupBy(schema.recipeOutputs.resourceKey).all();

    const stockpileKeys = this.db.select({
      resourceKey: schema.stockpiles.resourceKey,
    }).from(schema.stockpiles).groupBy(schema.stockpiles.resourceKey).all();

    const extraKeys = new Set<string>();
    for (const r of recipeOutputKeys)
      extraKeys.add(r.resourceKey);
    for (const s of stockpileKeys)
      extraKeys.add(s.resourceKey);
    for (const d of depositItems)
      extraKeys.delete(d.resourceKey);

    const extraItems: Array<{ resourceKey: string; name: string; category: string }> = [];
    for (const key of extraKeys) {
      extraItems.push({
        resourceKey: key,
        name: this.getResourceDisplayName(key),
        category: this.categorizeResourceKey(key),
      });
    }

    let allItems = [...depositItems, ...extraItems];

    if (params.query) {
      const q = params.query.toLowerCase();
      allItems = allItems.filter(item => item.name.toLowerCase().includes(q) || item.resourceKey.toLowerCase().includes(q));
    }
    if (params.category) {
      allItems = allItems.filter(item => item.category === params.category);
    }
    if (params.resourceKeys && params.resourceKeys.length > 0) {
      const keySet = new Set(params.resourceKeys);
      allItems = allItems.filter(item => keySet.has(item.resourceKey));
    }

    const totalCount = allItems.length;
    const items = allItems.slice(offset, offset + limit);

    return {
      items,
      totalCount,
      limit,
      offset,
      hasMore: offset + items.length < totalCount,
    };
  }

  private getResourceDisplayName(resourceKey: string): string {
    const element = ELEMENT_BY_SYMBOL.get(resourceKey);
    if (element)
      return `${element.symbol} (${element.name})`;
    return NON_ELEMENT_NAMES[resourceKey] ?? resourceKey;
  }

  private categorizeResourceKey(resourceKey: string): string {
    const renewableKeys = ['wood', 'water', 'arableland', 'biomass', 'population', 'solar', 'wind', 'hydro'];
    const nonRenewableKeys = ['coal', 'naturalgas', 'oil', 'peat', 'geothermal', 'stone', 'sand', 'gravel', 'clay', 'limestone', 'gypsum', 'salt', 'mica', 'asbestos', 'talc', 'graphite', 'diamond', 'gemstone', 'ree'];
    if (renewableKeys.includes(resourceKey))
      return 'Renewable';
    if (nonRenewableKeys.includes(resourceKey))
      return 'NonRenewable';
    if (ELEMENT_BY_SYMBOL.has(resourceKey))
      return 'Element';
    return 'Manufactured';
  }
}
