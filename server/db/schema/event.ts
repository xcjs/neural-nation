import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const events = sqliteTable('event_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tick: integer('tick').notNull(),
  timestamp: text('timestamp').notNull(),
  type: text('type').notNull(),
  message: text('message').notNull(),
  severity: text('severity').default('info').notNull(),
  facilityId: integer('facility_id'),
  data: text('data'),
})
