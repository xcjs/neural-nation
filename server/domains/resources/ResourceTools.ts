import type { IToolRegistry } from '../mcp/IToolRegistry';
import type { ResourceService } from './ResourceService';

export class ResourceTools {
  constructor(private readonly resourceService: ResourceService) {}

  register(registry: IToolRegistry): void {
    registry.register('survey_region', {
      name: 'survey_region',
      description: 'Survey a circular region for undiscovered resource deposits.',
      inputSchema: {
        type: 'object',
        properties: {
          lat: { type: 'number', description: 'Latitude (-90 to 90)' },
          lon: { type: 'number', description: 'Longitude (-180 to 180)' },
          radius: { type: 'number', description: 'Search radius in degrees (0.1 to 5.0)' },
        },
        required: ['lat', 'lon', 'radius'],
      },
    }, (args) => {
      return this.resourceService.surveyRegion(args.lat as number, args.lon as number, args.radius as number);
    });

    registry.register('get_discovered_resources', {
      name: 'get_discovered_resources',
      description: 'List all discovered resource deposits. Paginated.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number' }, offset: { type: 'number' } },
      },
    }, (args) => {
      return this.resourceService.getDiscoveredResources({ limit: args.limit as number, offset: args.offset as number });
    });

    registry.register('get_resource_overview', {
      name: 'get_resource_overview',
      description: 'Get overview of all resources: collected, remaining, production rate, and trend.',
      inputSchema: { type: 'object', properties: {} },
    }, () => {
      return this.resourceService.getResourceOverview();
    });

    registry.register('get_resource_details', {
      name: 'get_resource_details',
      description: 'Get detailed info for a specific resource: all deposits and stockpiles.',
      inputSchema: {
        type: 'object',
        properties: { resourceKey: { type: 'string', description: 'Resource identifier (e.g., "Fe", "Coal", "Steel")' } },
        required: ['resourceKey'],
      },
    }, (args) => {
      return this.resourceService.getResourceDetails(args.resourceKey as string);
    });

    registry.register('get_resource_stockpile', {
      name: 'get_resource_stockpile',
      description: 'List resource stockpiles, optionally filtered by resource.',
      inputSchema: {
        type: 'object',
        properties: { resourceKey: { type: 'string', description: 'Optional resource filter' } },
      },
    }, (args) => {
      return this.resourceService.getResourceStockpile(args.resourceKey as string | undefined);
    });

    registry.register('search_resources', {
      name: 'search_resources',
      description: 'Search resources by name, category, or what they are used for / produced by / needed for.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text search on resource name' },
          category: { type: 'string', enum: ['Renewable', 'NonRenewable', 'Element', 'Manufactured'] },
          usedByRecipe: { type: 'string' },
          producedByRecipe: { type: 'string' },
          neededForFacility: { type: 'string' },
          neededForTech: { type: 'string' },
          limit: { type: 'number' },
          offset: { type: 'number' },
        },
      },
    }, (args) => {
      return this.resourceService.searchResources(args as Parameters<typeof this.resourceService.searchResources>[0]);
    });
  }
}
