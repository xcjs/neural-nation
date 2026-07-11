import type { Container } from '../ioc/Container';
import { IDbConnection } from '../db/IDbConnection';
import { Lifecycle } from '../ioc/Lifecycle';
import { Token } from '../ioc/Token';
import { HumanityService } from './HumanityService';
import { HumanityRepository } from './Repositories/HumanityRepository';
import { IHumanityRepository } from './Repositories/IHumanityRepository';

export const IHumanityService = new Token<HumanityService>('IHumanityService');

export function registerHumanityModule(container: Container): void {
  container.bind(IHumanityRepository, c => new HumanityRepository(c.resolve(IDbConnection).getDb()), Lifecycle.Scoped);
  container.bind(IHumanityService, c => new HumanityService(c.resolve(IHumanityRepository)), Lifecycle.Scoped);
}
