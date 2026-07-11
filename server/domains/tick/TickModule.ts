import type { Container } from '../ioc/Container';
import { IDbConnection } from '../db/IDbConnection';
import { IGameRepository } from '../game/Repositories/IGameRepository';
import { Lifecycle } from '../ioc/Lifecycle';
import { Token } from '../ioc/Token';
import { TickProcessor } from './TickProcessor';

export const ITickProcessor = new Token<TickProcessor>('ITickProcessor');

export function registerTickModule(container: Container): void {
  container.bind(ITickProcessor, c => new TickProcessor(
    c.resolve(IGameRepository),
    c.resolve(IDbConnection),
  ), Lifecycle.Scoped);
}
