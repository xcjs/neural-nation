import type { Container } from '../ioc/Container';
import { Lifecycle } from '../ioc/Lifecycle';
import { EventBus } from './EventBus';
import { IEventBus } from './IEventBus';

export function registerEventsModule(container: Container): void {
  container.bind(IEventBus, () => new EventBus(), Lifecycle.Singleton);
}
