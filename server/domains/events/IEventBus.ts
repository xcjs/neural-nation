import { Token } from '../ioc/Token';

export interface GameEvent {
  type: string;
  [key: string]: unknown;
}

export type EventHandler = (event: GameEvent) => void;

export interface IEventBus {
  subscribe: (token: string, handler: EventHandler) => () => void;
  publish: (token: string, event: GameEvent) => void;
  publishMany: (token: string, events: GameEvent[]) => void;
  clearSubscribers: (token: string) => void;
}

export const IEventBus = new Token<IEventBus>('IEventBus');
