import type { Container } from '../ioc/Container';
import { IDbConnection } from '../db/IDbConnection';
import { Lifecycle } from '../ioc/Lifecycle';
import { Token } from '../ioc/Token';
import { ISpaceRepository } from './Repositories/ISpaceRepository';
import { SpaceRepository } from './Repositories/SpaceRepository';
import { SpaceService } from './SpaceService';

export const ISpaceService = new Token<SpaceService>('ISpaceService');

export function registerSpaceModule(container: Container): void {
  container.bind(ISpaceRepository, c => new SpaceRepository(c.resolve(IDbConnection).getDb()), Lifecycle.Scoped);
  container.bind(ISpaceService, c => new SpaceService(c.resolve(ISpaceRepository)), Lifecycle.Scoped);
}
