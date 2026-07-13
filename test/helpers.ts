import type { Container } from '../server/domains/ioc/Container';
import { DbConnection } from '../server/domains/db/DbConnection';
import { createGameDbFromPath, getDataDir, getGameDbPath } from '../server/domains/db/DbFactory';
import { IDbConnection } from '../server/domains/db/IDbConnection';
import { IGameFactory } from '../server/domains/game/GameModule';
import { findRegistryEntry, removeFromRegistry } from '../server/domains/game/GameRegistry';
import { getRootContainer } from '../server/domains/ioc/ContainerAccessor';
import { Lifecycle } from '../server/domains/ioc/Lifecycle';
import { IMcpDispatcher } from '../server/domains/mcp/McpModule';

export { findRegistryEntry, getDataDir, removeFromRegistry };

export function createGame(): { token: string; publicToken: string; mcpUrl: string } {
  const container = getRootContainer();
  const gameFactory = container.resolve(IGameFactory);
  return gameFactory.createGame();
}

export function createScopedContainer(token: string): Container {
  const root = getRootContainer();
  const scope = root.createScope();
  const dbPath = getGameDbPath(token);
  scope.bind(IDbConnection, () => new DbConnection(createGameDbFromPath(dbPath)), Lifecycle.Scoped);
  return scope;
}

export function executeTool(token: string, toolName: string, args: Record<string, unknown> = {}): { status: string; data: unknown; errorMessage?: string } {
  const scope = createScopedContainer(token);
  const dispatcher = scope.resolve(IMcpDispatcher);
  return dispatcher.executeTool(token, toolName, args);
}

export interface GameState {
  tick: number | null;
  status: string;
  createdAt: string;
  facilityCount: number;
  transportCount: number;
  population: number;
  pollutionLevel: number;
  forestCoverage: number;
  waterQuality: number;
  biodiversity: number;
}

export function getGameState(token: string): GameState {
  const scope = createScopedContainer(token);
  const dispatcher = scope.resolve(IMcpDispatcher);
  return dispatcher.getGameState() as GameState;
}
