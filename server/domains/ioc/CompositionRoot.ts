import type { Container } from './Container';
import { registerDbModule } from '../db/DbModule';
import { registerEventsModule } from '../events/EventsModule';
import { registerFacilitiesModule } from '../facilities/FacilitiesModule';
import { registerGameModule } from '../game/GameModule';
import { registerHumanityModule } from '../humanity/HumanityModule';
import { registerMcpModule } from '../mcp/McpModule';
import { registerPowerModule } from '../power/PowerModule';
import { registerResourcesModule } from '../resources/ResourcesModule';
import { registerSpaceModule } from '../space/SpaceModule';
import { registerTechModule } from '../tech/TechModule';
import { registerTerrainModule } from '../terrain/TerrainModule';
import { registerTickModule } from '../tick/TickModule';
import { registerTransportModule } from '../transport/TransportModule';
import { Container as ContainerClass } from './Container';

export function createRootContainer(): Container {
  const container = new ContainerClass();

  registerDbModule(container);
  registerEventsModule(container);
  registerGameModule(container);
  registerFacilitiesModule(container);
  registerResourcesModule(container);
  registerHumanityModule(container);
  registerPowerModule(container);
  registerSpaceModule(container);
  registerTechModule(container);
  registerTransportModule(container);
  registerTerrainModule(container);
  registerTickModule(container);
  registerMcpModule(container);

  return container;
}
