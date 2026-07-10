export enum ResourceCategory {
  Renewable = 'Renewable',
  NonRenewable = 'NonRenewable',
  Element = 'Element',
  Manufactured = 'Manufactured',
}

export interface ResourceOverviewRow {
  resourceKey: string
  name: string
  category: ResourceCategory
  collected: number
  remaining: number
  total: number
  unit: ResourceUnit
  productionRate: number
  trend: TrendDirection
}

export interface ResourceDeposit {
  id: number
  resourceKey: string
  lat: number
  lon: number
  quantity: number
  remaining: number
  grade: number
  discovered: boolean
  surface: boolean
  depth: number | null
}

export interface ResourceStockpileEntry {
  resourceKey: string
  facilityId: number | null
  quantity: number
  unit: ResourceUnit
}

export enum ResourceUnit {
  Tonne = 't',
  CubicMeter = 'm³',
  Megawatt = 'MW',
  Count = 'count',
}

export enum TrendDirection {
  Up = 'up',
  Down = 'down',
  Stable = 'stable',
}
