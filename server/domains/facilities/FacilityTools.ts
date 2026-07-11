import type { IToolRegistry } from '../mcp/IToolRegistry';
import type { FacilityService } from './FacilityService';

export class FacilityTools {
  constructor(private readonly facilityService: FacilityService) {}

  register(registry: IToolRegistry): void {
    registry.register('build_facility', {
      name: 'build_facility',
      description: 'Build a new facility. Facility starts in UnderConstruction status. Construction is a recipe (consumes materials). The footprint polygon must not overlap any existing facility footprint.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Facility type (e.g., "extractor", "smelter", "factory", "solar_farm")' },
          name: { type: 'string', description: 'Human-readable facility name' },
          lat: { type: 'number' },
          lon: { type: 'number' },
          footprint: {
            type: 'array',
            description: 'Polygon defining the facility shape on the map.',
            items: {
              type: 'object',
              properties: { lat: { type: 'number' }, lon: { type: 'number' } },
              required: ['lat', 'lon'],
            },
          },
        },
        required: ['type', 'name', 'lat', 'lon', 'footprint'],
      },
    }, (args) => {
      const buildArgs: { type: string; name: string; lat: number; lon: number; footprint?: Array<{ lat: number; lon: number }> } = {
        type: args.type as string,
        name: args.name as string,
        lat: args.lat as number,
        lon: args.lon as number,
      };
      if (args.footprint)
        buildArgs.footprint = args.footprint as Array<{ lat: number; lon: number }>;
      return this.facilityService.buildFacility(buildArgs);
    });

    registry.register('demolish_facility', {
      name: 'demolish_facility',
      description: 'Demolish a facility. Removes it and its buffers.',
      inputSchema: {
        type: 'object',
        properties: { facilityId: { type: 'number' } },
        required: ['facilityId'],
      },
    }, (args) => {
      return this.facilityService.demolishFacility(args.facilityId as number);
    });

    registry.register('list_facilities', {
      name: 'list_facilities',
      description: 'List all facilities. Paginated.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number' }, offset: { type: 'number' } },
      },
    }, (args) => {
      return this.facilityService.listFacilities({ limit: args.limit as number, offset: args.offset as number });
    });

    registry.register('get_facility_details', {
      name: 'get_facility_details',
      description: 'Get full details for a facility including input/output buffers, power status, and production info.',
      inputSchema: {
        type: 'object',
        properties: { facilityId: { type: 'number' } },
        required: ['facilityId'],
      },
    }, (args) => {
      return this.facilityService.getFacilityDetails(args.facilityId as number);
    });

    registry.register('set_production_target', {
      name: 'set_production_target',
      description: 'Set the active recipe and target output rate for a facility.',
      inputSchema: {
        type: 'object',
        properties: {
          facilityId: { type: 'number' },
          recipeId: { type: 'string', description: 'Recipe ID to activate' },
          targetRate: { type: 'number', description: 'Target output rate in tonnes/tick' },
        },
        required: ['facilityId', 'recipeId', 'targetRate'],
      },
    }, (args) => {
      return this.facilityService.setProductionTarget(args.facilityId as number, args.recipeId as string, args.targetRate as number);
    });

    registry.register('search_facilities', {
      name: 'search_facilities',
      description: 'Search facilities by type, status, or proximity.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          status: { type: 'string' },
          producesResource: { type: 'string' },
          consumesResource: { type: 'string' },
          nearLat: { type: 'number' },
          nearLon: { type: 'number' },
          radiusKm: { type: 'number' },
          limit: { type: 'number' },
          offset: { type: 'number' },
        },
      },
    }, (args) => {
      return this.facilityService.searchFacilities(args as Parameters<typeof this.facilityService.searchFacilities>[0]);
    });
  }
}
