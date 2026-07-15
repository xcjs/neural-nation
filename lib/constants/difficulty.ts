import { ResourceUnit } from '../types/resource';

export interface StartingResource {
  resourceKey: string;
  quantity: number;
  unit: ResourceUnit;
}

export interface WorldConfig {
  startingResources: StartingResource[];
  population: number;
  growthRate: number;
}

export const WorldDefaults: WorldConfig = {
  population: 8_100_000_000,
  growthRate: 0.009,
  startingResources: [
    { resourceKey: 'fuel', quantity: 1_000_000, unit: ResourceUnit.Tonne },
    { resourceKey: 'steel', quantity: 2_500_000_000, unit: ResourceUnit.Tonne },
    { resourceKey: 'concrete', quantity: 30_000_000_000, unit: ResourceUnit.Tonne },
    { resourceKey: 'machinery', quantity: 100_000_000, unit: ResourceUnit.Tonne },
    { resourceKey: 'food', quantity: 2_500_000_000, unit: ResourceUnit.Tonne },
    { resourceKey: 'energy', quantity: 3_000_000, unit: ResourceUnit.Megawatt },
  ],
};
