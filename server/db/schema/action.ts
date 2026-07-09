import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const actions = sqliteTable('actions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tick: integer('tick').notNull(),
  timestamp: text('timestamp').notNull(),
  toolName: text('tool_name').notNull(),
  arguments: text('arguments'),
  resultStatus: text('result_status').notNull(),
  resultData: text('result_data'),
  impactTags: text('impact_tags'),
  stateSnapshot: text('state_snapshot'),
})