import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const resources = sqliteTable('resources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  resourceKey: text('resource_key').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  quantity: real('quantity').notNull(),
  remaining: real('remaining').notNull(),
  grade: real('grade').notNull(),
  discovered: integer('discovered').default(0).notNull(),
  surface: integer('surface').default(0).notNull(),
  depth: real('depth'),
  unit: text('unit').notNull(),
});

export const stockpiles = sqliteTable('stockpiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  resourceKey: text('resource_key').notNull(),
  facilityId: integer('facility_id'),
  quantity: real('quantity').notNull(),
  capacity: real('capacity').notNull(),
  unit: text('unit').notNull(),
});

export const surveyLog = sqliteTable('survey_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tick: integer('tick').notNull(),
  timestamp: text('timestamp').notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  radius: real('radius').notNull(),
  depositsFound: integer('deposits_found').notNull(),
});
