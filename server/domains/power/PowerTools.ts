import type { IToolRegistry } from '../mcp/IToolRegistry';
import type { PowerService } from './PowerService';

export class PowerTools {
  constructor(private readonly powerService: PowerService) {}

  register(registry: IToolRegistry): void {
    registry.register('get_power_grid_status', {
      name: 'get_power_grid_status',
      description: 'Get full power grid status: total capacity, demand, grid topology, transmission lines with loss, connected components.',
      inputSchema: { type: 'object', properties: {} },
    }, () => {
      return this.powerService.getPowerGridStatus();
    });
  }
}
