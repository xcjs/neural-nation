import type { PaginatedResult } from '../../../lib/types/mcp';
import type { Recipe, RecipeInput, TechBranch, TechTreeNode, TechUnlock } from '../../../lib/types/tech';
import type { ITechRepository } from './Repositories/ITechRepository';
import { TechStatus } from '../../../lib/types/tech';

export class TechService {
  constructor(private readonly techRepo: ITechRepository) {}

  getTechTree(): TechTreeNode[] {
    const nodes = this.techRepo.getAllTechNodes();
    const research = this.techRepo.getAllGameResearch();
    const prerequisites = this.techRepo.getAllTechPrerequisites();
    const costs = this.techRepo.getAllTechCosts();
    const unlocks = this.techRepo.getAllTechUnlocks();

    return nodes.map((node) => {
      const researchEntry = research.find(r => r.techId === node.id);
      const nodePrerequisites = prerequisites.filter(p => p.techId === node.id).map(p => p.prerequisiteId);

      let status: TechStatus;
      if (researchEntry?.status === 'Completed') {
        status = TechStatus.Completed;
      }
      else if (researchEntry?.status === 'InProgress') {
        status = TechStatus.InProgress;
      }
      else {
        const completedTechIds = research
          .filter(r => r.status === 'Completed')
          .map(r => r.techId);
        const allPrereqsMet = nodePrerequisites.every(p => completedTechIds.includes(p));
        status = allPrereqsMet ? TechStatus.Available : TechStatus.Locked;
      }

      const nodeCosts: RecipeInput[] = costs
        .filter(c => c.techId === node.id)
        .map(c => ({
          resourceKey: c.resourceKey,
          quantity: c.quantity,
          unit: c.unit,
          optional: false,
        }));
      const nodeUnlocks: TechUnlock[] = unlocks
        .filter(u => u.techId === node.id)
        .map(u => ({
          type: u.unlockType as TechUnlock['type'],
          id: u.unlockId,
        }));

      return {
        id: node.id,
        name: node.name,
        description: node.description,
        tier: node.tier,
        category: node.category as TechBranch,
        prerequisites: nodePrerequisites,
        researchCost: nodeCosts,
        researchTime: node.researchTime,
        unlocks: nodeUnlocks,
        status,
        progress: researchEntry?.progress || 0,
      };
    });
  }

  getRecipes(params: {
    facilityType?: string;
    techRequired?: string;
    unlockedOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}): PaginatedResult<Recipe> {
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const recipeRows = this.techRepo.getRecipesWithFilters(params.facilityType, params.techRequired);
    const totalCount = this.techRepo.countRecipes();

    const allInputs = this.techRepo.getAllRecipeInputs();
    const allOutputs = this.techRepo.getAllRecipeOutputs();

    const recipes: Recipe[] = recipeRows.map(row => this.mapRowToRecipe(row, allInputs, allOutputs));

    if (params.unlockedOnly) {
      const completedTech = this.techRepo.getCompletedResearchTechIds();
      const filtered = recipes.filter(r => !r.techRequired || completedTech.includes(r.techRequired));
      return {
        items: filtered,
        totalCount: filtered.length,
        limit,
        offset,
        hasMore: false,
      };
    }

    return {
      items: recipes,
      totalCount,
      limit,
      offset,
      hasMore: offset + recipes.length < totalCount,
    };
  }

  startResearch(techNodeId: string, labFacilityId: number): { success: boolean; researchId: number } {
    const tick = this.techRepo.getMetaTickCount();

    const techNode = this.techRepo.getAllTechNodes().find(n => n.id === techNodeId);
    if (!techNode) {
      throw new Error(`Tech node not found: ${techNodeId}`);
    }

    const existing = this.techRepo.getResearchByTechId(techNodeId);
    if (existing) {
      throw new Error(`Research already ${existing.status} for ${techNodeId}`);
    }

    const prereqs = this.techRepo.getPrerequisitesForTech(techNodeId);
    if (prereqs.length > 0) {
      const completedTechIds = this.techRepo.getCompletedResearchTechIds();
      const missing = prereqs.filter(p => !completedTechIds.includes(p.prerequisiteId));
      if (missing.length > 0) {
        const missingIds = missing.map(p => p.prerequisiteId).join(', ');
        throw new Error(`Tech prerequisites not met for ${techNodeId}: requires ${missingIds}`);
      }
    }

    const lab = this.techRepo.getFacilityById(labFacilityId);
    if (!lab) {
      throw new Error(`Facility not found: ${labFacilityId}`);
    }
    if (lab.type !== 'ResearchLab') {
      throw new Error(`Facility ${labFacilityId} is a ${lab.type}, not a ResearchLab`);
    }
    if (lab.status !== 'Active') {
      throw new Error(`Research lab ${labFacilityId} is ${lab.status}, must be Active`);
    }

    const research = this.techRepo.insertGameResearch(techNodeId, labFacilityId, tick);
    return { success: true, researchId: research.id };
  }

  searchRecipes(params: {
    query?: string;
    outputResource?: string;
    inputResource?: string;
    facilityType?: string;
    techRequired?: string;
    unlockedOnly?: boolean;
    limit?: number;
    offset?: number;
  }): PaginatedResult<Recipe> {
    const limit = Math.min(params.limit || 50, 200);
    const offset = Math.max(params.offset || 0, 0);

    let recipes = this.techRepo.searchRecipesByName(params.query || '', params.facilityType, params.techRequired);

    if (params.outputResource) {
      const matchingOutputs = this.techRepo.getRecipeIdsByOutputResource(params.outputResource);
      recipes = recipes.filter(r => matchingOutputs.includes(r.id));
    }

    if (params.inputResource) {
      const matchingInputs = this.techRepo.getRecipeIdsByInputResource(params.inputResource);
      recipes = recipes.filter(r => matchingInputs.includes(r.id));
    }

    if (params.unlockedOnly) {
      const completedTechIds = this.techRepo.getCompletedResearchTechIds();
      recipes = recipes.filter(r => !r.techRequired || completedTechIds.includes(r.techRequired));
    }

    const totalCount = recipes.length;
    const pagedRecipes = recipes.slice(offset, offset + limit);

    const allInputs = this.techRepo.getAllRecipeInputs();
    const allOutputs = this.techRepo.getAllRecipeOutputs();

    const result: Recipe[] = pagedRecipes.map(r => this.mapRowToRecipe(r, allInputs, allOutputs));

    return {
      items: result,
      totalCount,
      limit,
      offset,
      hasMore: offset + result.length < totalCount,
    };
  }

  private mapRowToRecipe(
    row: { id: string; name: string; facilityType: string; craftTime: number; techRequired: string | null },
    allInputs: Array<{ recipeId: string; resourceKey: string; quantity: number; unit: string; optional: number }>,
    allOutputs: Array<{ recipeId: string; resourceKey: string; quantity: number; unit: string }>,
  ): Recipe {
    return {
      id: row.id,
      name: row.name,
      facilityType: row.facilityType,
      inputs: allInputs
        .filter(i => i.recipeId === row.id)
        .map(i => ({
          resourceKey: i.resourceKey,
          quantity: i.quantity,
          unit: i.unit,
          optional: Boolean(i.optional),
        })),
      outputs: allOutputs
        .filter(o => o.recipeId === row.id)
        .map(o => ({
          resourceKey: o.resourceKey,
          quantity: o.quantity,
          unit: o.unit,
        })),
      craftTime: row.craftTime,
      techRequired: row.techRequired,
    };
  }
}
