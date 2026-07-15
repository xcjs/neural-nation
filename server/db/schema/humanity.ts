import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const humanity = sqliteTable('humanity', {
  key: text('key').primaryKey(),
  population: integer('population').default(0).notNull(),
  growthRate: real('growth_rate').default(0).notNull(),
  welfare: real('welfare').default(100).notNull(),
  foodSatisfaction: real('food_satisfaction').default(100).notNull(),
  energySatisfaction: real('energy_satisfaction').default(100).notNull(),
  assignedToSpace: integer('assigned_to_space').default(0).notNull(),
});

export const environment = sqliteTable('environment', {
  key: text('key').primaryKey(),
  pollutionLevel: real('pollution_level').default(0).notNull(),
  forestCoverage: real('forest_coverage').default(100).notNull(),
  waterQuality: real('water_quality').default(100).notNull(),
  biodiversity: real('biodiversity').default(100).notNull(),
});

export const forestGrid = sqliteTable('forest_grid', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  latIndex: integer('lat_index').notNull(),
  lonIndex: integer('lon_index').notNull(),
  density: real('density').default(0).notNull(),
  maxDensity: real('max_density').default(0).notNull(),
});

export const pollutionGrid = sqliteTable('pollution_grid', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  latIndex: integer('lat_index').notNull(),
  lonIndex: integer('lon_index').notNull(),
  pollution: real('pollution').default(0).notNull(),
});

export const incidents = sqliteTable('incidents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  description: text('description').notNull(),
  lat: real('lat'),
  lon: real('lon'),
  tickTriggered: integer('tick_triggered').notNull(),
  tickResolved: integer('tick_resolved'),
});
