import type { Container } from '../ioc/Container';

export function registerDbModule(_container: Container): void {
  // IDbConnection is bound per-request scope by API handlers
  // with the game-specific DB path. No root-level bindings needed.
}
