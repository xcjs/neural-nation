import type { McpToolDef } from '../../../lib/types/mcp';

export const MCP_TOOLS: McpToolDef[] = [
  // Resource tools
  {
    name: 'survey_region',
    description: 'Survey a circular region for undiscovered resource deposits. Returns deposits found with resource type, quantity, and grade.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Latitude (-90 to 90)' },
        lon: { type: 'number', description: 'Longitude (-180 to 180)' },
        radius: { type: 'number', description: 'Search radius in degrees (0.1 to 5.0)' },
      },
      required: ['lat', 'lon', 'radius'],
    },
  },
  {
    name: 'get_discovered_resources',
    description: 'List all discovered resource deposits. Paginated.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 50)' },
        offset: { type: 'number', description: 'Skip results (default 0)' },
      },
    },
  },
  {
    name: 'get_resource_overview',
    description: 'Get overview of all resources: collected, remaining, production rate, and trend. Grouped by category (renewable, non-renewable, elements, manufactured).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_resource_details',
    description: 'Get detailed info for a specific resource: all deposits and stockpiles.',
    inputSchema: {
      type: 'object',
      properties: {
        resourceKey: { type: 'string', description: 'Resource identifier (e.g., "Fe", "Coal", "Steel")' },
      },
      required: ['resourceKey'],
    },
  },
  {
    name: 'get_resource_stockpile',
    description: 'List resource stockpiles, optionally filtered by resource.',
    inputSchema: {
      type: 'object',
      properties: {
        resourceKey: { type: 'string', description: 'Optional resource filter' },
      },
    },
  },
  {
    name: 'search_resources',
    description: 'Search resources by name, category, or what they are used for / produced by / needed for.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search on resource name' },
        category: { type: 'string', enum: ['Renewable', 'NonRenewable', 'Element', 'Manufactured'] },
        usedByRecipe: { type: 'string', description: 'Find resources used as input to this recipe' },
        producedByRecipe: { type: 'string', description: 'Find resources produced by this recipe' },
        neededForFacility: { type: 'string', description: 'Find resources needed to build this facility type' },
        neededForTech: { type: 'string', description: 'Find resources needed for this tech node' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  // Facility tools
  {
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
          description: 'Polygon defining the facility shape on the map. Array of {lat, lon} points forming a closed polygon (minimum 3 points). Must not overlap any existing facility.',
          items: {
            type: 'object',
            properties: {
              lat: { type: 'number' },
              lon: { type: 'number' },
            },
            required: ['lat', 'lon'],
          },
        },
      },
      required: ['type', 'name', 'lat', 'lon', 'footprint'],
    },
  },
  {
    name: 'demolish_facility',
    description: 'Demolish a facility. Removes it and its buffers.',
    inputSchema: {
      type: 'object',
      properties: {
        facilityId: { type: 'number' },
      },
      required: ['facilityId'],
    },
  },
  {
    name: 'list_facilities',
    description: 'List all facilities. Paginated.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'get_facility_details',
    description: 'Get full details for a facility including input/output buffers, power status, and production info.',
    inputSchema: {
      type: 'object',
      properties: {
        facilityId: { type: 'number' },
      },
      required: ['facilityId'],
    },
  },
  {
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
  },
  {
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
  },
  // Transport tools
  {
    name: 'build_transport',
    description: 'Build a transport link between two facilities. Returns terrain modifiers needed (tunnel, bridge, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['Road', 'Conveyor', 'Pipeline', 'PowerLine', 'Tunnel', 'Bridge', 'PumpingStation', 'TransmissionTower', 'SubseaPipeline'] },
        fromFacilityId: { type: 'number' },
        toFacilityId: { type: 'number' },
        resourceKey: { type: 'string', description: 'Resource to transport (optional, set later via assign_route)' },
      },
      required: ['type', 'fromFacilityId', 'toFacilityId'],
    },
  },
  {
    name: 'demolish_transport',
    description: 'Demolish a transport link.',
    inputSchema: {
      type: 'object',
      properties: {
        transportId: { type: 'number' },
      },
      required: ['transportId'],
    },
  },
  {
    name: 'list_transports',
    description: 'List all transport links. Paginated.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'assign_route',
    description: 'Assign a resource and flow rate to a transport link.',
    inputSchema: {
      type: 'object',
      properties: {
        transportId: { type: 'number' },
        resourceKey: { type: 'string' },
        flowRate: { type: 'number', description: 'Flow rate in tonnes/tick' },
      },
      required: ['transportId', 'resourceKey', 'flowRate'],
    },
  },
  {
    name: 'get_supply_chain_status',
    description: 'Get the full supply chain graph: facility nodes and transport edges with throughput and flow data.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_terrain_path',
    description: 'Pre-scout a transport route between two points. Returns terrain cells, required modifiers (tunnel/bridge), and distance.',
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
  },
  // Tech tree tools
  {
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
  },
  {
    name: 'get_tech_tree',
    description: 'Get the full technology tree with research status and progress.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_recipes',
    description: 'List recipes, optionally filtered by facility type, required tech, or unlocked status. Paginated.',
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
  },
  {
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
  },
  // Terraforming tools
  {
    name: 'terraform',
    description: 'Execute a terraforming operation using a terraforming facility.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['flatten_terrain', 'dig_canal', 'build_road_embankment', 'create_reservoir', 'drain_area', 'divert_river', 'level_mountain', 'raise_land', 'excavate_mine_shaft', 'create_mountain', 'shift_continental_plate', 'ocean_to_land', 'land_to_ocean'] },
        facilityId: { type: 'number', description: 'Terraforming facility ID' },
        targetCells: { type: 'array', items: { type: 'object', properties: { latIndex: { type: 'number' }, lonIndex: { type: 'number' } }, required: ['latIndex', 'lonIndex'] } },
      },
      required: ['action', 'facilityId', 'targetCells'],
    },
  },
  {
    name: 'get_terrain_modifications',
    description: 'List terrain modifications applied to this game. Paginated.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'get_effective_terrain',
    description: 'Get the effective terrain (base + modifications) at a specific lat/lon.',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number' },
        lon: { type: 'number' },
      },
      required: ['lat', 'lon'],
    },
  },
  {
    name: 'get_terraform_cost_estimate',
    description: 'Preview resource costs, environmental impact, and potential incidents before committing to a terraforming operation.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['flatten_terrain', 'dig_canal', 'build_road_embankment', 'create_reservoir', 'drain_area', 'divert_river', 'level_mountain', 'raise_land', 'excavate_mine_shaft', 'create_mountain', 'shift_continental_plate', 'ocean_to_land', 'land_to_ocean'] },
        targetCells: { type: 'array', items: { type: 'object', properties: { latIndex: { type: 'number' }, lonIndex: { type: 'number' } }, required: ['latIndex', 'lonIndex'] } },
      },
      required: ['action', 'targetCells'],
    },
  },
  // Power tools
  {
    name: 'get_power_grid_status',
    description: 'Get full power grid status: total capacity, demand, grid topology, transmission lines with loss, connected components.',
    inputSchema: { type: 'object', properties: {} },
  },
  // Environment tools
  {
    name: 'get_environmental_status',
    description: 'Get population state and environmental metrics (pollution, forest coverage, water quality, biodiversity).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_impact_forecast',
    description: 'Project environmental and population trajectory based on current trends.',
    inputSchema: { type: 'object', properties: {} },
  },
  // Space tools
  {
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
  },
  {
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
  },
  {
    name: 'get_space_status',
    description: 'Get status of all space facilities and missions.',
    inputSchema: { type: 'object', properties: {} },
  },
  // Game state tools
  {
    name: 'get_game_state',
    description: 'Get high-level game state summary: tick, status, resource counts, facility counts, population, power summary.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_event_log',
    description: 'Get the event log. Paginated, newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
];
