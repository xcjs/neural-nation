import type { Container } from '../ioc/Container';
import { IDbConnection } from '../db/IDbConnection';
import { Lifecycle } from '../ioc/Lifecycle';
import { Token } from '../ioc/Token';
import { ITerrainRepository } from './Repositories/ITerrainRepository';
import { TerrainRepository } from './Repositories/TerrainRepository';
import { TerrainService } from './TerrainService';

export const ITerrainService = new Token<TerrainService>('ITerrainService');

export function registerTerrainModule(container: Container): void {
  container.bind(ITerrainRepository, c => new TerrainRepository(c.resolve(IDbConnection).getDb()), Lifecycle.Scoped);
  container.bind(ITerrainService, c => new TerrainService(c.resolve(ITerrainRepository)), Lifecycle.Scoped);
}
