import type { schema } from '../../../db/schema';
import { Token } from '../../ioc/Token';

export interface ITechRepository {
  getAllTechNodes: () => Array<typeof schema.techNodes.$inferSelect>;
  getAllGameResearch: () => Array<typeof schema.gameResearch.$inferSelect>;
  getAllTechPrerequisites: () => Array<typeof schema.techPrerequisites.$inferSelect>;
  getAllTechCosts: () => Array<typeof schema.techCosts.$inferSelect>;
  getAllTechUnlocks: () => Array<typeof schema.techUnlocks.$inferSelect>;
  getAllRecipes: () => Array<typeof schema.recipes.$inferSelect>;
  getAllRecipeInputs: () => Array<typeof schema.recipeInputs.$inferSelect>;
  getAllRecipeOutputs: () => Array<typeof schema.recipeOutputs.$inferSelect>;
  getRecipesWithFilters: (facilityType?: string, techRequired?: string) => Array<typeof schema.recipes.$inferSelect>;
  countRecipes: () => number;
  getCompletedResearchTechIds: () => string[];
  getResearchByTechId: (techId: string) => typeof schema.gameResearch.$inferSelect | undefined;
  getPrerequisitesForTech: (techId: string) => Array<typeof schema.techPrerequisites.$inferSelect>;
  getFacilityById: (id: number) => typeof schema.facilities.$inferSelect | undefined;
  getMetaTickCount: () => number;
  insertGameResearch: (techId: string, labFacilityId: number, tick: number) => typeof schema.gameResearch.$inferSelect;
  searchRecipesByName: (query: string, facilityType?: string, techRequired?: string) => Array<typeof schema.recipes.$inferSelect>;
  getRecipeIdsByOutputResource: (resourceKey: string) => string[];
  getRecipeIdsByInputResource: (resourceKey: string) => string[];
}

export const ITechRepository = new Token<ITechRepository>('ITechRepository');
