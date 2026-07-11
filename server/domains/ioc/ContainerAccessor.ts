import type { Container } from './Container';
import { createRootContainer } from './CompositionRoot';

let rootContainer: Container | null = null;

export function getRootContainer(): Container {
  if (!rootContainer) {
    rootContainer = createRootContainer();
  }
  return rootContainer;
}
