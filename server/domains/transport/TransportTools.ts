import type { TransportType } from '../../../lib/types/transport';
import type { IToolRegistry } from '../mcp/IToolRegistry';
import type { TransportService } from './TransportService';

export class TransportTools {
  constructor(private readonly transportService: TransportService) {}

  register(registry: IToolRegistry): void {
    registry.register('build_transport', {
      name: 'build_transport',
      description: 'Build a transport link between two facilities. Returns terrain modifiers needed.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['Road', 'Conveyor', 'Pipeline', 'PowerLine', 'Tunnel', 'Bridge', 'PumpingStation', 'TransmissionTower', 'SubseaPipeline'] },
          fromFacilityId: { type: 'number' },
          toFacilityId: { type: 'number' },
          resourceKey: { type: 'string', description: 'Resource to transport (optional)' },
        },
        required: ['type', 'fromFacilityId', 'toFacilityId'],
      },
    }, (args) => {
      const params: { type: TransportType; fromFacilityId: number; toFacilityId: number; resourceKey?: string } = {
        type: args.type as TransportType,
        fromFacilityId: args.fromFacilityId as number,
        toFacilityId: args.toFacilityId as number,
      };
      if (args.resourceKey)
        params.resourceKey = args.resourceKey as string;
      return this.transportService.buildTransport(params);
    });

    registry.register('demolish_transport', {
      name: 'demolish_transport',
      description: 'Demolish a transport link.',
      inputSchema: {
        type: 'object',
        properties: { transportId: { type: 'number' } },
        required: ['transportId'],
      },
    }, (args) => {
      return this.transportService.demolishTransport(args.transportId as number);
    });

    registry.register('list_transports', {
      name: 'list_transports',
      description: 'List all transport links. Paginated.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number' }, offset: { type: 'number' } },
      },
    }, (args) => {
      return this.transportService.listTransports({ limit: args.limit as number, offset: args.offset as number });
    });

    registry.register('assign_route', {
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
    }, (args) => {
      return this.transportService.assignRoute(args.transportId as number, args.resourceKey as string, args.flowRate as number);
    });

    registry.register('get_supply_chain_status', {
      name: 'get_supply_chain_status',
      description: 'Get the full supply chain graph: facility nodes and transport edges.',
      inputSchema: { type: 'object', properties: {} },
    }, () => {
      return this.transportService.getSupplyChainStatus();
    });
  }
}
