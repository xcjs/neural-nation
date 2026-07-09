export interface SpaceSummary {
  stations: SpaceFacilitySummary[]
  drones: SpaceFacilitySummary[]
  lunarFacilities: SpaceFacilitySummary[]
  deepSpaceProbes: SpaceFacilitySummary[]
  activeMissions: SpaceMission[]
  totalCrewAssigned: number
}

export interface SpaceFacilitySummary {
  id: number
  type: string
  name: string
  status: string
  crewAssigned: number
  crewCapacity: number
}

export interface SpaceMission {
  id: number
  type: string
  status: string
  target: string
  launchTick: number
  returnTick: number | null
  payload: string | null
}