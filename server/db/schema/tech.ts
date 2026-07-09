import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const recipes = sqliteTable('recipes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  facilityType: text('facility_type').notNull(),
  craftTime: integer('craft_time').notNull(),
  techRequired: text('tech_required'),
})

export const recipeInputs = sqliteTable('recipe_inputs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: text('recipe_id').notNull(),
  resourceKey: text('resource_key').notNull(),
  quantity: real('quantity').notNull(),
  unit: text('unit').notNull(),
  optional: integer('optional').default(0).notNull(),
})

export const recipeOutputs = sqliteTable('recipe_outputs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: text('recipe_id').notNull(),
  resourceKey: text('resource_key').notNull(),
  quantity: real('quantity').notNull(),
  unit: text('unit').notNull(),
})

export const techNodes = sqliteTable('tech_nodes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  tier: integer('tier').notNull(),
  category: text('category').notNull(),
  researchTime: integer('research_time').notNull(),
})

export const techCosts = sqliteTable('tech_costs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  techId: text('tech_id').notNull(),
  resourceKey: text('resource_key').notNull(),
  quantity: real('quantity').notNull(),
  unit: text('unit').notNull(),
})

export const techUnlocks = sqliteTable('tech_unlocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  techId: text('tech_id').notNull(),
  unlockType: text('unlock_type').notNull(),
  unlockId: text('unlock_id').notNull(),
})

export const techPrerequisites = sqliteTable('tech_prerequisites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  techId: text('tech_id').notNull(),
  prerequisiteId: text('prerequisite_id').notNull(),
})

export const gameResearch = sqliteTable('game_research', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  techId: text('tech_id').notNull(),
  status: text('status').default('Locked').notNull(),
  progress: real('progress').default(0).notNull(),
  startedAtTick: integer('started_at_tick'),
  completedAtTick: integer('completed_at_tick'),
  labFacilityId: integer('lab_facility_id'),
})