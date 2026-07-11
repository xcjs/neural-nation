import type { SpaceFacilitySummary, SpaceMission, SpaceSummary } from '../../../lib/types/space';
import type { ISpaceRepository } from './Repositories/ISpaceRepository';

export class SpaceService {
  constructor(private readonly spaceRepo: ISpaceRepository) {}

  getSpaceStatus(): SpaceSummary {
    const facilities = this.spaceRepo.getAllSpaceFacilities();
    const missions = this.spaceRepo.getAllSpaceMissions();

    const facilitySummaries: SpaceFacilitySummary[] = facilities.map(f => ({
      id: f.id,
      type: f.type,
      name: f.name,
      status: f.status,
      crewAssigned: f.crewAssigned,
      crewCapacity: f.crewCapacity,
      orbital: Boolean(f.orbital),
    }));

    const missionSummaries: SpaceMission[] = missions.map(m => ({
      id: m.id,
      type: m.type,
      status: m.status,
      target: m.target,
      launchTick: m.launchTick,
      returnTick: m.returnTick,
      payload: m.payload,
      facilityId: m.facilityId,
    }));

    return {
      facilities: facilitySummaries,
      missions: missionSummaries,
    };
  }

  launchMission(params: {
    facilityId: number;
    missionType: string;
    target: string;
    payload: string;
  }): { missionId: number } {
    const tick = this.spaceRepo.getMetaTickCount();

    const mission = this.spaceRepo.insertSpaceMission({
      type: params.missionType,
      status: 'Launched',
      target: params.target,
      launchTick: tick,
      returnTick: null,
      payload: params.payload,
      facilityId: params.facilityId,
    });

    return { missionId: mission.id };
  }

  assignSpaceCrew(facilityId: number, crewCount: number): { success: boolean } {
    this.spaceRepo.updateSpaceFacilityCrew(facilityId, crewCount);

    const human = this.spaceRepo.getHumanity();
    if (human) {
      this.spaceRepo.updateHumanityAssignedToSpace(human.assignedToSpace + crewCount);
    }

    return { success: true };
  }
}
