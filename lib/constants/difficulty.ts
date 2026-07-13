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
    { resourceKey: 'Fuel', quantity: 1_000_000, unit: ResourceUnit.Tonne },
    { resourceKey: 'Steel', quantity: 2_500_000_000, unit: ResourceUnit.Tonne },
    { resourceKey: 'Concrete', quantity: 30_000_000_000, unit: ResourceUnit.Tonne },
    { resourceKey: 'Machinery', quantity: 100_000_000, unit: ResourceUnit.Tonne },
    { resourceKey: 'Food', quantity: 2_500_000_000, unit: ResourceUnit.Tonne },
    { resourceKey: 'Energy', quantity: 3_000_000, unit: ResourceUnit.Megawatt },
  ],
};
