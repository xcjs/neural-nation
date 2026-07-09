import { DifficultyPreset } from '../types/game'
import { ResourceUnit } from '../types/resource'

export interface StartingResource {
  resourceKey: string
  min: number
  max: number
  unit: ResourceUnit
}

export interface DifficultyConfig {
  label: string
  description: string
  startingResources: StartingResource[]
  populationRange: { min: number; max: number }
}

export const DifficultyConfigs: Record<DifficultyPreset, DifficultyConfig> = {
  [DifficultyPreset.Easy]: {
    label: 'Easy',
    description: 'Generous starting resources — ample time to bootstrap.',
    startingResources: [
      { resourceKey: 'Fuel', min: 35, max: 50, unit: ResourceUnit.Tonne },
      { resourceKey: 'Steel', min: 60, max: 100, unit: ResourceUnit.Tonne },
      { resourceKey: 'Concrete', min: 120, max: 200, unit: ResourceUnit.Tonne },
      { resourceKey: 'Machinery', min: 5, max: 10, unit: ResourceUnit.Tonne },
      { resourceKey: 'Food', min: 300, max: 500, unit: ResourceUnit.Tonne },
      { resourceKey: 'Energy', min: 250, max: 500, unit: ResourceUnit.Megawatt },
    ],
    populationRange: { min: 500, max: 1000 },
  },
  [DifficultyPreset.Normal]: {
    label: 'Normal',
    description: 'Moderate starting resources — enough for 2-3 basic facilities.',
    startingResources: [
      { resourceKey: 'Fuel', min: 25, max: 40, unit: ResourceUnit.Tonne },
      { resourceKey: 'Steel', min: 40, max: 70, unit: ResourceUnit.Tonne },
      { resourceKey: 'Concrete', min: 80, max: 140, unit: ResourceUnit.Tonne },
      { resourceKey: 'Machinery', min: 3, max: 7, unit: ResourceUnit.Tonne },
      { resourceKey: 'Food', min: 200, max: 350, unit: ResourceUnit.Tonne },
      { resourceKey: 'Energy', min: 150, max: 300, unit: ResourceUnit.Megawatt },
    ],
    populationRange: { min: 300, max: 700 },
  },
  [DifficultyPreset.Hard]: {
    label: 'Hard',
    description: 'Minimal starting resources — must bootstrap fast or fail.',
    startingResources: [
      { resourceKey: 'Fuel', min: 15, max: 25, unit: ResourceUnit.Tonne },
      { resourceKey: 'Steel', min: 25, max: 50, unit: ResourceUnit.Tonne },
      { resourceKey: 'Concrete', min: 50, max: 100, unit: ResourceUnit.Tonne },
      { resourceKey: 'Machinery', min: 2, max: 5, unit: ResourceUnit.Tonne },
      { resourceKey: 'Food', min: 100, max: 200, unit: ResourceUnit.Tonne },
      { resourceKey: 'Energy', min: 50, max: 150, unit: ResourceUnit.Megawatt },
    ],
    populationRange: { min: 200, max: 500 },
  },
}