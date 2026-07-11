type EventHandler = (event: GameEvent) => void;

export interface GameEvent {
  type: string;
  [key: string]: unknown;
}

const subscribers = new Map<string, Set<EventHandler>>();

export function subscribe(token: string, handler: EventHandler): () => void {
  let set = subscribers.get(token);
  if (!set) {
    set = new Set();
    subscribers.set(token, set);
  }
  set.add(handler);
  return () => {
    set?.delete(handler);
    if (set && set.size === 0) {
      subscribers.delete(token);
    }
  };
}

export function publish(token: string, event: GameEvent): void {
  const set = subscribers.get(token);
  if (!set)
    return;
  for (const handler of set) {
    try {
      handler(event);
    }
    catch {
      // ignore handler errors
    }
  }
}

export function publishMany(token: string, events: GameEvent[]): void {
  for (const e of events) {
    publish(token, e);
  }
}

export function clearSubscribers(token: string): void {
  subscribers.delete(token);
}
