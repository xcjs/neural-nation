export interface TechTreeNode {
  id: string
  name: string
  description: string
  tier: number
  category: TechBranch
  prerequisites: string[]
  researchCost: RecipeInput[]
  researchTime: number
  unlocks: TechUnlock[]
  status: TechStatus
  progress: number
}

export enum TechBranch {
  Metallurgy = 'Metallurgy',
  Chemistry = 'Chemistry',
  Power = 'Power',
  Space = 'Space',
  Terraforming = 'Terraforming',
}

export enum TechStatus {
  Completed = 'Completed',
  InProgress = 'InProgress',
  Available = 'Available',
  Locked = 'Locked',
}

export interface TechUnlock {
  type: 'Recipe' | 'FacilityType' | 'TerraformAction'
  id: string
}

export interface Recipe {
  id: string
  name: string
  facilityType: string
  inputs: RecipeInput[]
  outputs: RecipeOutput[]
  craftTime: number
  techRequired: string | null
}

export interface RecipeInput {
  resourceKey: string
  quantity: number
  unit: string
  optional: boolean
}

export interface RecipeOutput {
  resourceKey: string
  quantity: number
  unit: string
}