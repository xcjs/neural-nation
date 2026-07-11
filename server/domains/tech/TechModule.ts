import type { Container } from '../ioc/Container';
import { IDbConnection } from '../db/IDbConnection';
import { Lifecycle } from '../ioc/Lifecycle';
import { Token } from '../ioc/Token';
import { ITechRepository } from './Repositories/ITechRepository';
import { TechRepository } from './Repositories/TechRepository';
import { TechService } from './TechService';

export const ITechService = new Token<TechService>('ITechService');

export function registerTechModule(container: Container): void {
  container.bind(ITechRepository, c => new TechRepository(c.resolve(IDbConnection).getDb()), Lifecycle.Scoped);
  container.bind(ITechService, c => new TechService(c.resolve(ITechRepository)), Lifecycle.Scoped);
}
