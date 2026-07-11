import type { GameDb } from '../../../db/client';
import type { IPowerRepository, PowerFacilityRow, PowerLineRow } from './IPowerRepository';
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
    }).from(schema.facilities).all() as PowerFacilityRow[];
  }

  getAllPowerLines(): PowerLineRow[] {
    return this.db.select().from(schema.powerLines).all() as PowerLineRow[];
  }
}
