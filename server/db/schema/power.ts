import { integer, real, sqliteTable } from 'drizzle-orm/sqlite-core'

export const powerLines = sqliteTable('power_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fromFacilityId: integer('from_facility_id').notNull(),
  toFacilityId: integer('to_facility_id').notNull(),
  capacity: real('capacity').notNull(),
  load: real('load').default(0).notNull(),
  transmissionLoss: real('transmission_loss').default(0).notNull(),
  createdAtTick: integer('created_at_tick').notNull(),
})

export const batteryBanks = sqliteTable('battery_banks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  facilityId: integer('facility_id').notNull(),
  stored: real('stored').default(0).notNull(),
  capacity: real('capacity').notNull(),
})
