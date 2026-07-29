import { integer, real, sqliteTable } from 'drizzle-orm/sqlite-core';

export const batteryBanks = sqliteTable('battery_banks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  facilityId: integer('facility_id').notNull(),
  stored: real('stored').default(0).notNull(),
  capacity: real('capacity').notNull(),
});
