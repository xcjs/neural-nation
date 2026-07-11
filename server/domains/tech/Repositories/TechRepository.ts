import type { GameDb } from '../../../db/client';
import type { ITechRepository } from './ITechRepository';
import { and, eq, like, sql } from 'drizzle-orm';
import { schema } from '../../../db/schema';

export class TechRepository implements ITechRepository {
  constructor(private readonly db: GameDb) {}

  getAllTechNodes(): Array<typeof schema.techNodes.$inferSelect> {
    return this.db.select().from(schema.techNodes).all();
  }

  getAllGameResearch(): Array<typeof schema.gameResearch.$inferSelect> {
    return this.db.select().from(schema.gameResearch).all();
  }

  getAllTechPrerequisites(): Array<typeof schema.techPrerequisites.$inferSelect> {
    return this.db.select().from(schema.techPrerequisites).all();
  }

  getAllTechCosts(): Array<typeof schema.techCosts.$inferSelect> {
    return this.db.select().from(schema.techCosts).all();
  }

  getAllTechUnlocks(): Array<typeof schema.techUnlocks.$inferSelect> {
    return this.db.select().from(schema.techUnlocks).all();
  }

  getAllRecipes(): Array<typeof schema.recipes.$inferSelect> {
    return this.db.select().from(schema.recipes).all();
  }

  getAllRecipeInputs(): Array<typeof schema.recipeInputs.$inferSelect> {
    return this.db.select().from(schema.recipeInputs).all();
  }

  getAllRecipeOutputs(): Array<typeof schema.recipeOutputs.$inferSelect> {
    return this.db.select().from(schema.recipeOutputs).all();
  }

  getRecipesWithFilters(facilityType?: string, techRequired?: string): Array<typeof schema.recipes.$inferSelect> {
    const conditions = [];
    if (facilityType) {
      conditions.push(eq(schema.recipes.facilityType, facilityType));
    }
    if (techRequired) {
      conditions.push(eq(schema.recipes.techRequired, techRequired));
    }
    let queryBuilder = this.db.select().from(schema.recipes).$dynamic();
    if (conditions.length > 0) {
      queryBuilder = queryBuilder.where(and(...conditions));
    }
    return queryBuilder.all();
  }

  countRecipes(): number {
    return this.db.select({ count: sql<number>`count(*)` })
      .from(schema.recipes)
      .get()
      ?.count || 0;
  }

  getCompletedResearchTechIds(): string[] {
    return this.db.select().from(schema.gameResearch).where(eq(schema.gameResearch.status, 'Completed')).all().map(r => r.techId);
  }

  getResearchByTechId(techId: string): typeof schema.gameResearch.$inferSelect | undefined {
    return this.db.select().from(schema.gameResearch).where(eq(schema.gameResearch.techId, techId)).get();
  }

  getPrerequisitesForTech(techId: string): Array<typeof schema.techPrerequisites.$inferSelect> {
    return this.db.select().from(schema.techPrerequisites).where(eq(schema.techPrerequisites.techId, techId)).all();
  }

  getFacilityById(id: number): typeof schema.facilities.$inferSelect | undefined {
    return this.db.select().from(schema.facilities).where(eq(schema.facilities.id, id)).get();
  }

  getMetaTickCount(): number {
    return this.db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()?.tickCount || 0;
  }

  insertGameResearch(techId: string, labFacilityId: number, tick: number): typeof schema.gameResearch.$inferSelect {
    return this.db.insert(schema.gameResearch).values({
      techId,
      status: 'InProgress',
      progress: 0,
      startedAtTick: tick,
      completedAtTick: null,
      labFacilityId,
    }).returning().get();
  }

  searchRecipesByName(query: string, facilityType?: string, techRequired?: string): Array<typeof schema.recipes.$inferSelect> {
    const conditions = [];
    if (facilityType) {
      conditions.push(eq(schema.recipes.facilityType, facilityType));
    }
    if (techRequired) {
      conditions.push(eq(schema.recipes.techRequired, techRequired));
    }
    if (query) {
      conditions.push(like(schema.recipes.name, `%${query}%`));
    }
    let queryBuilder = this.db.select().from(schema.recipes).$dynamic();
    if (conditions.length > 0) {
      queryBuilder = queryBuilder.where(and(...conditions));
    }
    return queryBuilder.all();
  }

  getRecipeIdsByOutputResource(resourceKey: string): string[] {
    return this.db.select().from(schema.recipeOutputs).where(eq(schema.recipeOutputs.resourceKey, resourceKey)).all().map(r => r.recipeId);
  }

  getRecipeIdsByInputResource(resourceKey: string): string[] {
    return this.db.select().from(schema.recipeInputs).where(eq(schema.recipeInputs.resourceKey, resourceKey)).all().map(r => r.recipeId);
  }
}
