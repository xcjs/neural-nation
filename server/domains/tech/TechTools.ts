import type { IToolRegistry } from '../mcp/IToolRegistry';
import type { TechService } from './TechService';

export class TechTools {
  constructor(private readonly techService: TechService) {}

  register(registry: IToolRegistry): void {
    registry.register('start_research', {
      name: 'start_research',
      description: 'Start researching a technology node at a research lab.',
      inputSchema: {
        type: 'object',
        properties: {
          techNodeId: { type: 'string', description: 'Tech node ID to research' },
          labFacilityId: { type: 'number', description: 'Research lab facility ID' },
        },
        required: ['techNodeId', 'labFacilityId'],
      },
    }, (args) => {
      return this.techService.startResearch(args.techNodeId as string, args.labFacilityId as number);
    });

    registry.register('get_tech_tree', {
      name: 'get_tech_tree',
      description: 'Get the full technology tree with research status and progress.',
      inputSchema: { type: 'object', properties: {} },
    }, () => {
      return this.techService.getTechTree();
    });

    registry.register('get_recipes', {
      name: 'get_recipes',
      description: 'List recipes, optionally filtered by facility type, required tech, or unlocked status.',
      inputSchema: {
        type: 'object',
        properties: {
          facilityType: { type: 'string' },
          techRequired: { type: 'string' },
          unlockedOnly: { type: 'boolean' },
          limit: { type: 'number' },
          offset: { type: 'number' },
        },
      },
    }, (args) => {
      return this.techService.getRecipes(args as Parameters<typeof this.techService.getRecipes>[0]);
    });

    registry.register('search_recipes', {
      name: 'search_recipes',
      description: 'Search recipes by output resource, input resource, facility type, or tech requirement.',
      inputSchema: {
        type: 'object',
        properties: {
          outputResource: { type: 'string' },
          inputResource: { type: 'string' },
          facilityType: { type: 'string' },
          techRequired: { type: 'string' },
          unlockedOnly: { type: 'boolean' },
          limit: { type: 'number' },
          offset: { type: 'number' },
        },
      },
    }, (args) => {
      return this.techService.searchRecipes(args as Parameters<typeof this.techService.searchRecipes>[0]);
    });
  }
}
