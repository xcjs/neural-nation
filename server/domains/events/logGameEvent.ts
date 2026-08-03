import type { GameDb } from '../../db/client';
import { schema } from '../../db/schema';

export function logGameEvent(
  db: GameDb,
  tick: number,
  type: string,
  message: string,
  severity: string = 'info',
  facilityId: number | null = null,
  data: string | null = null,
): void {
  db.insert(schema.events).values({
    tick,
    timestamp: new Date().toISOString(),
    type,
    message,
    severity,
    facilityId,
    data,
  }).run();
}
