import type { GameDb } from '../../../db/client';
import type { IPowerRepository, PowerFacilityRow, PowerLineTransportRow } from './IPowerRepository';
import { eq } from 'drizzle-orm';
import { schema } from '../../../db/schema';

export class PowerRepository implements IPowerRepository {
  constructor(private readonly db: GameDb) {}

  getAllFacilities(): PowerFacilityRow[] {
    return this.db.select({
      id: schema.facilities.id,
      type: schema.facilities.type,
      lat: schema.facilities.lat,
      lon: schema.facilities.lon,
      targetOutputRate: schema.facilities.targetOutputRate,
      powerConsumption: schema.facilities.powerConsumption,
      powerThrottle: schema.facilities.powerThrottle,
    }).from(schema.facilities).all() as PowerFacilityRow[];
  }

  getAllPowerLineTransports(): PowerLineTransportRow[] {
    return this.db.select({
      id: schema.transports.id,
      fromFacilityId: schema.transports.fromFacilityId,
      toFacilityId: schema.transports.toFacilityId,
      type: schema.transports.type,
      capacity: schema.transports.capacity,
    }).from(schema.transports)
      .where(eq(schema.transports.type, 'PowerLine'))
      .all() as PowerLineTransportRow[];
  }
}