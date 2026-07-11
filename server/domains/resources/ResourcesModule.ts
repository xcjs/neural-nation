import type { Container } from '../ioc/Container';
import { IDbConnection } from '../db/IDbConnection';
import { Lifecycle } from '../ioc/Lifecycle';
import { Token } from '../ioc/Token';
import { IResourceRepository } from './Repositories/IResourceRepository';
import { ResourceRepository } from './Repositories/ResourceRepository';
import { ResourceService } from './ResourceService';

export const IResourceService = new Token<ResourceService>('IResourceService');

export function registerResourcesModule(container: Container): void {
  container.bind(IResourceRepository, c => new ResourceRepository(c.resolve(IDbConnection).getDb()), Lifecycle.Scoped);
  container.bind(IResourceService, c => new ResourceService(c.resolve(IResourceRepository)), Lifecycle.Scoped);
}
