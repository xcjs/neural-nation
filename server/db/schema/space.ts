import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const spaceFacilities = sqliteTable('space_facilities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  status: text('status').default('Planning').notNull(),
  crewAssigned: integer('crew_assigned').default(0).notNull(),
  crewCapacity: integer('crew_capacity').default(0).notNull(),
  orbital: integer('orbital').default(0).notNull(),
  createdAtTick: integer('created_at_tick').notNull(),
})

export const spaceMissions = sqliteTable('space_missions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  status: text('status').default('Planning').notNull(),
  target: text('target').notNull(),
  launchTick: integer('launch_tick'),
  returnTick: integer('return_tick'),
  payload: text('payload'),
  facilityId: integer('facility_id'),
})