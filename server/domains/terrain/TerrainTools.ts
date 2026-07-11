import type { IToolRegistry } from '../mcp/IToolRegistry';
import type { TerrainService } from './TerrainService';
import { TerraformAction } from '../../../lib/types/terrain';

const TERRAFORM_ACTION_VALUES = Object.values(TerraformAction) as string[];

export class TerrainTools {
  constructor(private readonly terrainService: TerrainService) {}

  register(registry: IToolRegistry): void {
    registry.register('get_terrain_path', {
      name: 'get_terrain_path',
      description: 'Pre-scout a transport route between two points.',
      inputSchema: {
        type: 'object',
        properties: {
          fromLat: { type: 'number' },
          fromLon: { type: 'number' },
          toLat: { type: 'number' },
          toLon: { type: 'number' },
        },
        required: ['fromLat', 'fromLon', 'toLat', 'toLon'],
      },
    }, (args) => {
      return this.terrainService.getTerrainPath(args.fromLat as number, args.fromLon as number, args.toLat as number, args.toLon as number);
    });

    registry.register('terraform', {
      name: 'terraform',
      description: 'Execute a terraforming operation using a terraforming facility.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: TERRAFORM_ACTION_VALUES },
          facilityId: { type: 'number', description: 'Terraforming facility ID' },
          targetCells: { type: 'array', items: { type: 'object', properties: { latIndex: { type: 'number' }, lonIndex: { type: 'number' } }, required: ['latIndex', 'lonIndex'] } },
        },
        required: ['action', 'facilityId', 'targetCells'],
      },
    }, (args) => {
      return this.terrainService.terraform(args.action as TerraformAction, {
        facilityId: args.facilityId as number,
        targetCells: args.targetCells as Array<{ latIndex: number; lonIndex: number }>,
      });
    });

    registry.register('get_terrain_modifications', {
      name: 'get_terrain_modifications',
      description: 'List terrain modifications applied to this game. Paginated.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number' }, offset: { type: 'number' } },
      },
    }, (args) => {
      return this.terrainService.getTerrainModifications({ limit: args.limit as number, offset: args.offset as number });
    });

    registry.register('get_effective_terrain', {
      name: 'get_effective_terrain',
      description: 'Get the effective terrain (base + modifications) at a specific lat/lon.',
      inputSchema: {
        type: 'object',
        properties: { lat: { type: 'number' }, lon: { type: 'number' } },
        required: ['lat', 'lon'],
      },
    }, (args) => {
      return this.terrainService.getEffectiveTerrain(args.lat as number, args.lon as number);
    });

    registry.register('get_terraform_cost_estimate', {
      name: 'get_terraform_cost_estimate',
      description: 'Preview resource costs, environmental impact, and potential incidents before committing to a terraforming operation.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: TERRAFORM_ACTION_VALUES },
          targetCells: { type: 'array', items: { type: 'object', properties: { latIndex: { type: 'number' }, lonIndex: { type: 'number' } }, required: ['latIndex', 'lonIndex'] } },
        },
        required: ['action', 'targetCells'],
      },
    }, (args) => {
      return this.terrainService.getTerraformCostEstimate(args.action as TerraformAction, { targetCells: args.targetCells as Array<{ latIndex: number; lonIndex: number }> });
    });
  }
}
