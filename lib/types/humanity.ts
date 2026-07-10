export interface PopulationState {
  count: number
  growthRate: number
  welfare: number
  foodSatisfaction: number
  energySatisfaction: number
  assignedToSpace: number
  trend: 'up' | 'down' | 'stable'
}

export interface EnvironmentState {
  population: PopulationState
  pollutionLevel: number
  forestCoverage: number
  waterQuality: number
  biodiversity: number
  pollutionTrend: 'up' | 'down' | 'stable'
  forestTrend: 'up' | 'down' | 'stable'
  waterTrend: 'up' | 'down' | 'stable'
  biodiversityTrend: 'up' | 'down' | 'stable'
  activeIncidents: EnvironmentalIncident[]
}

export interface EnvironmentalIncident {
  id: number
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  lat: number | null
  lon: number | null
  tickTriggered: number
  tickResolved: number | null
}
