import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value'),
  token: text('token'),
  publicToken: text('public_token'),
  createdAt: text('created_at'),
  lastActiveAt: text('last_active_at'),
  lastTickAt: text('last_tick_at'),
  tickCount: integer('tick_count').default(0),
  status: text('status').default('Active'),
  difficulty: text('difficulty').default('Normal'),
  cleanupEligibleAt: text('cleanup_eligible_at'),
})