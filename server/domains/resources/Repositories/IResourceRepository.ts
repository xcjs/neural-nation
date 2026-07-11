import type { PaginatedResult } from '../../../../lib/types/mcp';
import type { schema } from '../../../db/schema';
import { Token } from '../../ioc/Token';

export interface IResourceRepository {
  findUndiscoveredDepositsWithinRadius: (lat: number, lon: number, radius: number) => Array<typeof schema.resources.$inferSelect>;
  markDepositDiscovered: (id: number) => void;
  getGameTick: () => number;
  insertSurveyLog: (log: { tick: number; timestamp: string; lat: number; lon: number; radius: number; depositsFound: number }) => void;
  getDiscoveredDeposits: (limit: number, offset: number) => Array<typeof schema.resources.$inferSelect>;
  countDiscoveredDeposits: () => number;
  getAllDeposits: () => Array<typeof schema.resources.$inferSelect>;
  getAllStockpiles: () => Array<typeof schema.stockpiles.$inferSelect>;
  getDepositsByResourceKey: (resourceKey: string) => Array<typeof schema.resources.$inferSelect>;
  getStockpilesByResourceKey: (resourceKey: string) => Array<typeof schema.stockpiles.$inferSelect>;
  getStockpiles: (resourceKey?: string) => Array<typeof schema.stockpiles.$inferSelect>;
  findRecipeInputResourceKeysByRecipeId: (recipeId: string) => string[];
  findRecipeOutputResourceKeysByRecipeId: (recipeId: string) => string[];
  findRecipeIdsByFacilityType: (facilityType: string) => string[];
  findRecipeInputResourceKeysByRecipeIds: (recipeIds: string[]) => string[];
  findTechCostResourceKeysByTechId: (techId: string) => string[];
  searchResources: (params: {
    query?: string;
    category?: string;
    resourceKeys?: string[];
    limit?: number;
    offset?: number;
  }) => PaginatedResult<{ resourceKey: string; name: string; category: string }>;
}

export const IResourceRepository = new Token<IResourceRepository>('IResourceRepository');
