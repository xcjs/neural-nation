import type { Container } from '../ioc/Container';
import { IDbConnection } from '../db/IDbConnection';
import { Lifecycle } from '../ioc/Lifecycle';
import { Token } from '../ioc/Token';
import { PowerService } from './PowerService';
import { IPowerRepository } from './Repositories/IPowerRepository';
import { PowerRepository } from './Repositories/PowerRepository';

export const IPowerService = new Token<PowerService>('IPowerService');

export function registerPowerModule(container: Container): void {
  container.bind(IPowerRepository, c => new PowerRepository(c.resolve(IDbConnection).getDb()), Lifecycle.Scoped);
  container.bind(IPowerService, c => new PowerService(c.resolve(IPowerRepository)), Lifecycle.Scoped);
}
