import type { EventHandler, GameEvent, IEventBus } from './IEventBus';

export class EventBus implements IEventBus {
  private subscribers = new Map<string, Set<EventHandler>>();

  subscribe(token: string, handler: EventHandler): () => void {
    let set = this.subscribers.get(token);
    if (!set) {
      set = new Set();
      this.subscribers.set(token, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  publish(token: string, event: GameEvent): void {
    const set = this.subscribers.get(token);
    if (set) {
      for (const handler of set)
        handler(event);
    }
  }

  publishMany(token: string, events: GameEvent[]): void {
    for (const event of events)
      this.publish(token, event);
  }

  clearSubscribers(token: string): void {
    this.subscribers.delete(token);
  }
}
