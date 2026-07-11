import type { IToolRegistry } from '../mcp/IToolRegistry';
import type { SpaceService } from './SpaceService';

export class SpaceTools {
  constructor(private readonly spaceService: SpaceService) {}

  register(registry: IToolRegistry): void {
    registry.register('launch_mission', {
      name: 'launch_mission',
      description: 'Launch a space mission from a spaceport.',
      inputSchema: {
        type: 'object',
        properties: {
          facilityId: { type: 'number' },
          missionType: { type: 'string' },
          target: { type: 'string' },
          payload: { type: 'string' },
        },
        required: ['facilityId', 'missionType', 'target', 'payload'],
      },
    }, (args) => {
      return this.spaceService.launchMission({
        facilityId: args.facilityId as number,
        missionType: args.missionType as string,
        target: args.target as string,
        payload: args.payload as string,
      });
    });

    registry.register('assign_space_crew', {
      name: 'assign_space_crew',
      description: 'Assign crew from Earth population to a space facility.',
      inputSchema: {
        type: 'object',
        properties: {
          facilityId: { type: 'number' },
          crewCount: { type: 'number' },
        },
        required: ['facilityId', 'crewCount'],
      },
    }, (args) => {
      return this.spaceService.assignSpaceCrew(args.facilityId as number, args.crewCount as number);
    });

    registry.register('get_space_status', {
      name: 'get_space_status',
      description: 'Get status of all space facilities and missions.',
      inputSchema: { type: 'object', properties: {} },
    }, () => {
      return this.spaceService.getSpaceStatus();
    });
  }
}
