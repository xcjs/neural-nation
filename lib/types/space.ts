export interface SpaceSummary {
  facilities: SpaceFacilitySummary[];
  missions: SpaceMission[];
}

export interface SpaceFacilitySummary {
  id: number;
  type: string;
  name: string;
  status: string;
  crewAssigned: number;
  crewCapacity: number;
  orbital: boolean;
}

export interface SpaceMission {
  id: number;
  type: string;
  status: string;
  target: string;
  launchTick: number | null;
  returnTick: number | null;
  payload: string | null;
  facilityId: number | null;
}
