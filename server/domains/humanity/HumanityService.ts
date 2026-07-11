import type { EnvironmentalIncident, EnvironmentState, PopulationState } from '../../../lib/types/humanity';
import type { PaginatedResult, PaginationParams } from '../../../lib/types/mcp';
import type { IHumanityRepository } from './Repositories/IHumanityRepository';

export class HumanityService {
  constructor(private readonly humanityRepo: IHumanityRepository) {}

  getEnvironmentalStatus(): { population: PopulationState; environment: EnvironmentState } {
    const human = this.humanityRepo.getHumanity();
    const env = this.humanityRepo.getEnvironment();

    if (!human || !env) {
      throw new Error('Humanity/environment state not found');
    }

    return {
      population: {
        count: human.population,
        growthRate: human.growthRate,
        welfare: human.welfare,
        foodSatisfaction: human.foodSatisfaction,
        energySatisfaction: human.energySatisfaction,
        assignedToSpace: human.assignedToSpace,
        trend: 'stable',
      },
      environment: {
        population: {
          count: human.population,
          growthRate: human.growthRate,
          welfare: human.welfare,
          foodSatisfaction: human.foodSatisfaction,
          energySatisfaction: human.energySatisfaction,
          assignedToSpace: human.assignedToSpace,
          trend: 'stable',
        },
        pollutionLevel: env.pollutionLevel,
        forestCoverage: env.forestCoverage,
        waterQuality: env.waterQuality,
        biodiversity: env.biodiversity,
        pollutionTrend: 'stable',
        forestTrend: 'stable',
        waterTrend: 'stable',
        biodiversityTrend: 'stable',
        activeIncidents: [],
      },
    };
  }

  getImpactForecast(): { trajectory: string[]; warnings: string[] } {
    const env = this.humanityRepo.getEnvironment();
    const human = this.humanityRepo.getHumanity();

    if (!env || !human) {
      return { trajectory: [], warnings: ['Unable to load state'] };
    }

    const trajectory: string[] = [];
    const warnings: string[] = [];

    if (env.pollutionLevel > 50) {
      trajectory.push('Pollution critical - biodiversity collapse imminent');
      warnings.push('biodiversity_loss');
    }
    if (env.forestCoverage < 30) {
      trajectory.push('Forest coverage critical - ecosystem collapse risk');
      warnings.push('deforestation_collapse');
    }
    if (human.foodSatisfaction < 50) {
      trajectory.push('Food shortage - population decline expected');
      warnings.push('famine');
    }
    if (human.population < 100) {
      trajectory.push('Population critical - civilization collapse risk');
      warnings.push('population_collapse');
    }

    if (trajectory.length === 0) {
      trajectory.push('Stable - no immediate concerns');
    }

    return { trajectory, warnings };
  }

  getIncidents(params: PaginationParams = {}): PaginatedResult<EnvironmentalIncident> {
    const limit = params.limit || 25;
    const offset = params.offset || 0;

    const items = this.humanityRepo.getIncidents(limit, offset);
    const totalCount = this.humanityRepo.countIncidents();

    return {
      items: items as unknown as EnvironmentalIncident[],
      totalCount,
      limit,
      offset,
      hasMore: offset + items.length < totalCount,
    };
  }
}
