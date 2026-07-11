import type { Container } from './Container';

export interface Module {
  register: (container: Container) => void;
}
