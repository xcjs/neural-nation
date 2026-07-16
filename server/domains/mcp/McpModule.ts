import type { Container } from '../ioc/Container';
import pkg from '../../../package.json' with { type: 'json' };
import { IDbConnection } from '../db/IDbConnection';
import { IEventBus } from '../events/IEventBus';
import { IFacilityService } from '../facilities/FacilitiesModule';
import { FacilityTools } from '../facilities/FacilityTools';
import { IGameRepository } from '../game/Repositories/IGameRepository';
import { IHumanityService } from '../humanity/HumanityModule';
import { HumanityTools } from '../humanity/HumanityTools';
import { Lifecycle } from '../ioc/Lifecycle';
import { Token } from '../ioc/Token';
import { IPowerService } from '../power/PowerModule';
import { PowerTools } from '../power/PowerTools';
import { IResourceService } from '../resources/ResourcesModule';
import { ResourceTools } from '../resources/ResourceTools';
import { ISpaceService } from '../space/SpaceModule';
import { SpaceTools } from '../space/SpaceTools';
import { ITechService } from '../tech/TechModule';
import { TechTools } from '../tech/TechTools';
import { ITerrainService } from '../terrain/TerrainModule';
import { TerrainTools } from '../terrain/TerrainTools';
import { ITickProcessor } from '../tick/TickModule';
import { ITransportService } from '../transport/TransportModule';
import { TransportTools } from '../transport/TransportTools';
import { GameTools } from './GameTools';
import { IToolRegistry } from './IToolRegistry';
import { McpDispatcher } from './McpDispatcher';
import { McpServer } from './McpServer';
import { ToolRegistry } from './ToolRegistry';

export const IGameTools = new Token<GameTools>('IGameTools');
export const IMcpDispatcher = new Token<McpDispatcher>('IMcpDispatcher');
export const IMcpServer = new Token<McpServer>('IMcpServer');

export function registerMcpModule(container: Container): void {
  container.bind(IGameTools, c => new GameTools(
    c.resolve(IDbConnection),
    c.resolve(IGameRepository),
    c.resolve(IHumanityService),
  ), Lifecycle.Scoped);

  container.bind(IToolRegistry, (c) => {
    const registry = new ToolRegistry();

    new ResourceTools(c.resolve(IResourceService)).register(registry);
    new FacilityTools(c.resolve(IFacilityService)).register(registry);
    new TransportTools(c.resolve(ITransportService)).register(registry);
    new TechTools(c.resolve(ITechService)).register(registry);
    new TerrainTools(c.resolve(ITerrainService)).register(registry);
    new PowerTools(c.resolve(IPowerService)).register(registry);
    new HumanityTools(c.resolve(IHumanityService)).register(registry);
    new SpaceTools(c.resolve(ISpaceService)).register(registry);
    c.resolve(IGameTools).register(registry);

    return registry;
  }, Lifecycle.Scoped);

  container.bind(IMcpDispatcher, c => new McpDispatcher(
    c.resolve(IToolRegistry),
    c.resolve(IGameRepository),
    c.resolve(IDbConnection),
    c.resolve(IEventBus),
    c.resolve(ITickProcessor),
    c.resolve(IGameTools),
    c.resolve(IFacilityService),
    c.resolve(IPowerService),
  ), Lifecycle.Scoped);

  container.bind(IMcpServer, c => new McpServer(
    c.resolve(IToolRegistry),
    c.resolve(IMcpDispatcher),
    pkg.version,
  ), Lifecycle.Scoped);
}
