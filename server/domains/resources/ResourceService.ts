import type { PaginatedResult, PaginationParams } from '../../../lib/types/mcp';
import type { ResourceOverviewRow, ResourceStockpileEntry } from '../../../lib/types/resource';
import type { IResourceRepository } from './Repositories/IResourceRepository';
import { ELEMENTS } from '../../../lib/constants/elements';
import { ResourceCategory, ResourceUnit, TrendDirection } from '../../../lib/types/resource';

export class ResourceService {
  constructor(private readonly resourceRepo: IResourceRepository) {}

  surveyRegion(
    lat: number,
    lon: number,
    radius: number,
  ): { depositsFound: number; discovered: Array<{ resourceKey: string; quantity: number; grade: number }> } {
    const deposits = this.resourceRepo.findUndiscoveredDepositsWithinRadius(lat, lon, radius);

    const discovered: Array<{ resourceKey: string; quantity: number; grade: number }> = [];
    let depositsFound = 0;

    for (const deposit of deposits) {
      const distance = Math.sqrt(
        (deposit.lat - lat) ** 2 + (deposit.lon - lon) ** 2,
      );

      if (distance <= radius) {
        this.resourceRepo.markDepositDiscovered(deposit.id);

        discovered.push({
          resourceKey: deposit.resourceKey,
          quantity: deposit.remaining,
          grade: deposit.grade,
        });
        depositsFound++;
      }
    }

    const tick = this.resourceRepo.getGameTick();

    this.resourceRepo.insertSurveyLog({
      tick,
      timestamp: new Date().toISOString(),
      lat,
      lon,
      radius,
      depositsFound,
    });

    return { depositsFound, discovered };
  }

  getDiscoveredResources(params: PaginationParams = {}): PaginatedResult<{ id: number; resourceKey: string; name: string; lat: number; lon: number; quantity: number; remaining: number; grade: number; surface: number; depth: number | null; unit: string; category: string; discovered: number }> {
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const items = this.resourceRepo.getDiscoveredDeposits(limit, offset);
    const totalCount = this.resourceRepo.countDiscoveredDeposits();

    return {
      items,
      totalCount,
      limit,
      offset,
      hasMore: offset + items.length < totalCount,
    };
  }

  getResourceOverview(): ResourceOverviewRow[] {
    const deposits = this.resourceRepo.getAllDeposits();
    const stockpiles = this.resourceRepo.getAllStockpiles();

    const resourceMap = new Map<string, { collected: number; remaining: number; total: number }>();

    for (const deposit of deposits) {
      const existing = resourceMap.get(deposit.resourceKey);
      if (existing) {
        existing.remaining += deposit.remaining;
        existing.total += deposit.quantity;
      }
      else {
        resourceMap.set(deposit.resourceKey, {
          collected: 0,
          remaining: deposit.remaining,
          total: deposit.quantity,
        });
      }
    }

    for (const stockpile of stockpiles) {
      const existing = resourceMap.get(stockpile.resourceKey);
      if (existing) {
        existing.collected += stockpile.quantity;
      }
      else {
        resourceMap.set(stockpile.resourceKey, {
          collected: stockpile.quantity,
          remaining: 0,
          total: 0,
        });
      }
    }

    const rows: ResourceOverviewRow[] = [];

    for (const [resourceKey, data] of resourceMap) {
      if (data.collected === 0 && data.remaining === 0 && data.total === 0)
        continue;
      const category = this.categorizeResource(resourceKey);
      const unit = this.getUnitForCategory(category);
      const trend = data.remaining > 0 ? TrendDirection.Stable : TrendDirection.Down;

      rows.push({
        resourceKey,
        name: this.getResourceName(resourceKey),
        category,
        collected: data.collected,
        remaining: data.remaining,
        total: data.total,
        unit,
        productionRate: 0,
        trend,
      });
    }

    return rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }

  getResourceDetails(resourceKey: string) {
    const deposits = this.resourceRepo.getDepositsByResourceKey(resourceKey);
    const stockpiles = this.resourceRepo.getStockpilesByResourceKey(resourceKey);

    return { resourceKey, deposits, stockpiles };
  }

  getResourceStockpile(resourceKey?: string): ResourceStockpileEntry[] {
    const rows = this.resourceRepo.getStockpiles(resourceKey);

    return rows.map(r => ({
      resourceKey: r.resourceKey,
      facilityId: r.facilityId,
      quantity: r.quantity,
      unit: r.unit as ResourceUnit,
    }));
  }

  searchResources(
    params: {
      query?: string;
      category?: string;
      usedByRecipe?: string;
      producedByRecipe?: string;
      neededForFacility?: string;
      neededForTech?: string;
      limit?: number;
      offset?: number;
    },
  ): PaginatedResult<{ resourceKey: string; name: string; category: string }> {
    const relationshipKeys = new Set<string>();

    if (params.usedByRecipe) {
      const inputs = this.resourceRepo.findRecipeInputResourceKeysByRecipeId(params.usedByRecipe);
      inputs.forEach(k => relationshipKeys.add(k));
    }

    if (params.producedByRecipe) {
      const outputs = this.resourceRepo.findRecipeOutputResourceKeysByRecipeId(params.producedByRecipe);
      outputs.forEach(k => relationshipKeys.add(k));
    }

    if (params.neededForFacility) {
      const recipesForType = this.resourceRepo.findRecipeIdsByFacilityType(params.neededForFacility);
      if (recipesForType.length > 0) {
        const inputs = this.resourceRepo.findRecipeInputResourceKeysByRecipeIds(recipesForType);
        inputs.forEach(k => relationshipKeys.add(k));
      }
    }

    if (params.neededForTech) {
      const costs = this.resourceRepo.findTechCostResourceKeysByTechId(params.neededForTech);
      costs.forEach(k => relationshipKeys.add(k));
    }

    const searchParams: { query?: string; category?: string; resourceKeys?: string[]; limit?: number; offset?: number } = {};
    if (params.query !== undefined)
      searchParams.query = params.query;
    if (params.category !== undefined)
      searchParams.category = params.category;
    if (relationshipKeys.size > 0)
      searchParams.resourceKeys = [...relationshipKeys];
    if (params.limit !== undefined)
      searchParams.limit = params.limit;
    if (params.offset !== undefined)
      searchParams.offset = params.offset;

    return this.resourceRepo.searchResources(searchParams);
  }

  private categorizeResource(resourceKey: string): ResourceCategory {
    const element = ELEMENTS.find(e => e.symbol.toLowerCase() === resourceKey.toLowerCase() || e.name === resourceKey);
    if (element) {
      return ResourceCategory.Element;
    }

    const renewableKeys = ['wood', 'water', 'arableland', 'biomass', 'population', 'solar', 'wind', 'hydro', 'Wood', 'Water', 'ArableLand', 'Biomass', 'Population', 'Solar', 'Wind', 'Hydro'];
    if (renewableKeys.includes(resourceKey)) {
      return ResourceCategory.Renewable;
    }

    const nonRenewableKeys = ['coal', 'oil', 'naturalgas', 'stone', 'gravel', 'uranium', 'thorium', 'Coal', 'Oil', 'NaturalGas', 'Stone', 'Gravel', 'Uranium', 'Thorium'];
    if (nonRenewableKeys.includes(resourceKey)) {
      return ResourceCategory.NonRenewable;
    }

    return ResourceCategory.Manufactured;
  }

  private getUnitForCategory(category: ResourceCategory): ResourceUnit {
    switch (category) {
      case ResourceCategory.Renewable:
      case ResourceCategory.NonRenewable:
      case ResourceCategory.Element:
      case ResourceCategory.Manufactured:
      default:
        return ResourceUnit.Tonne;
    }
  }

  private getResourceName(resourceKey: string): string {
    const element = ELEMENTS.find(e => e.symbol.toLowerCase() === resourceKey.toLowerCase());
    if (element) {
      return element.name;
    }
    return resourceKey;
  }
}
