import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const terrain = sqliteTable('terrain', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  latIndex: integer('lat_index').notNull(),
  lonIndex: integer('lon_index').notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  elevation: real('elevation').notNull(),
  terrainClass: text('terrain_class').notNull(),
})

export const terrainModifications = sqliteTable('terrain_modifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  latIndex: integer('lat_index').notNull(),
  lonIndex: integer('lon_index').notNull(),
  elevationDelta: real('elevation_delta').notNull(),
  newTerrainClass: text('new_terrain_class'),
  modifiedBy: text('modified_by').notNull(),
  modifiedAtTick: integer('modified_at_tick').notNull(),
  operationId: text('operation_id').notNull(),
  reason: text('reason').notNull(),
})