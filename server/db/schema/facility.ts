import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const facilities = sqliteTable('facilities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  status: text('status').default('Planning').notNull(),
  techRequired: text('tech_required'),
  activeRecipeId: text('active_recipe_id'),
  targetOutputRate: real('target_output_rate').default(0).notNull(),
  powerConsumption: real('power_consumption').default(0).notNull(),
  powerConnected: integer('power_connected').default(0).notNull(),
  throughput: real('throughput').default(0).notNull(),
  constructionProgress: real('construction_progress').default(0).notNull(),
  elevation: real('elevation').notNull(),
  terrainClass: text('terrain_class').notNull(),
  createdAtTick: integer('created_at_tick').notNull(),
})

export const facilityBuffers = sqliteTable('facility_buffers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  facilityId: integer('facility_id').notNull(),
  resourceKey: text('resource_key').notNull(),
  quantity: real('quantity').default(0).notNull(),
  capacity: real('capacity').notNull(),
  unit: text('unit').notNull(),
  direction: text('direction').notNull(),
})