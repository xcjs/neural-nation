import type { Container } from '../domains/ioc/Container';
import { DbConnection } from '../domains/db/DbConnection';
import { createGameDbFromPath, getGameDbPath } from '../domains/db/DbFactory';
import { IDbConnection } from '../domains/db/IDbConnection';
import { getRootContainer } from '../domains/ioc/ContainerAccessor';
import { Lifecycle } from '../domains/ioc/Lifecycle';

export function useContainer(): Container {
  return getRootContainer();
}

export function createScopedContainer(token: string): Container {
  const root = useContainer();
  const scope = root.createScope();
  const dbPath = getGameDbPath(token);
  scope.bind(IDbConnection, () => new DbConnection(createGameDbFromPath(dbPath)), Lifecycle.Scoped);
  return scope;
}
