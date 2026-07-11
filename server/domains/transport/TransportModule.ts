import type { Container } from '../ioc/Container';
import { IDbConnection } from '../db/IDbConnection';
import { Lifecycle } from '../ioc/Lifecycle';
import { Token } from '../ioc/Token';
import { ITransportRepository } from './Repositories/ITransportRepository';
import { TransportRepository } from './Repositories/TransportRepository';
import { TransportService } from './TransportService';

export const ITransportService = new Token<TransportService>('ITransportService');

export function registerTransportModule(container: Container): void {
  container.bind(ITransportRepository, c => new TransportRepository(c.resolve(IDbConnection).getDb()), Lifecycle.Scoped);
  container.bind(ITransportService, c => new TransportService(
    c.resolve(ITransportRepository),
  ), Lifecycle.Scoped);
}
