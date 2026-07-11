import type { IToolRegistry } from '../mcp/IToolRegistry';
import type { HumanityService } from './HumanityService';

export class HumanityTools {
  constructor(private readonly humanityService: HumanityService) {}

  register(registry: IToolRegistry): void {
    registry.register('get_environmental_status', {
      name: 'get_environmental_status',
      description: 'Get population state and environmental metrics (pollution, forest coverage, water quality, biodiversity).',
      inputSchema: { type: 'object', properties: {} },
    }, () => {
      return this.humanityService.getEnvironmentalStatus();
    });

    registry.register('get_impact_forecast', {
      name: 'get_impact_forecast',
      description: 'Project environmental and population trajectory based on current trends.',
      inputSchema: { type: 'object', properties: {} },
    }, () => {
      return this.humanityService.getImpactForecast();
    });
  }
}
