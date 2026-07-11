import type { Container } from '../ioc/Container';
import { IDbConnection } from '../db/IDbConnection';
import { IFacilityService } from '../facilities/FacilitiesModule';
import { IHumanityService } from '../humanity/HumanityModule';
import { Lifecycle } from '../ioc/Lifecycle';
import { Token } from '../ioc/Token';
import { IPowerService } from '../power/PowerModule';
import { IResourceService } from '../resources/ResourcesModule';
import { ISpaceService } from '../space/SpaceModule';
import { ITechService } from '../tech/TechModule';
import { ITransportService } from '../transport/TransportModule';
import { GameCleanupService } from './GameCleanupService';
import { GameFactory } from './GameFactory';
import { GameService } from './GameService';
import { GameStateService } from './GameStateService';
import { GameRepository } from './Repositories/GameRepository';
import { IGameRepository } from './Repositories/IGameRepository';

export const IGameService = new Token<GameService>('IGameService');
export const IGameFactory = new Token<GameFactory>('IGameFactory');
export const IGameStateService = new Token<GameStateService>('IGameStateService');
export const IGameCleanupService = new Token<GameCleanupService>('IGameCleanupService');

export function registerGameModule(container: Container): void {
  container.bind(IGameRepository, c => new GameRepository(c.resolve(IDbConnection).getDb()), Lifecycle.Scoped);
  container.bind(IGameFactory, () => new GameFactory(), Lifecycle.Transient);
  container.bind(IGameService, c => new GameService(
    c.resolve(IGameRepository),
    c.resolve(IGameFactory),
  ), Lifecycle.Scoped);
  container.bind(IGameStateService, c => new GameStateService(
    c.resolve(IGameRepository),
    c.resolve(IResourceService),
    c.resolve(IFacilityService),
    c.resolve(ITransportService),
    c.resolve(IHumanityService),
    c.resolve(ITechService),
    c.resolve(IPowerService),
    c.resolve(ISpaceService),
  ), Lifecycle.Scoped);
  container.bind(IGameCleanupService, () => new GameCleanupService(), Lifecycle.Singleton);
}
