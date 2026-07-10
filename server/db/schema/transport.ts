import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const transports = sqliteTable('transports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  fromFacilityId: integer('from_facility_id').notNull(),
  toFacilityId: integer('to_facility_id').notNull(),
  fromLat: real('from_lat').notNull(),
  fromLon: real('from_lon').notNull(),
  toLat: real('to_lat').notNull(),
  toLon: real('to_lon').notNull(),
  flowRate: real('flow_rate').default(0).notNull(),
  resourceKey: text('resource_key'),
  capacity: real('capacity').notNull(),
  terrainModifiers: text('terrain_modifiers'),
  createdAtTick: integer('created_at_tick').notNull(),
})
