import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const templatePath = resolve('data', 'games', '_template.db')

let db: Database.Database

beforeAll(() => {
  if (!existsSync(templatePath)) {
    throw new Error('Template DB not found. Run `npm run build:template` first.')
  }
  db = new Database(templatePath, { readonly: true })
  db.pragma('foreign_keys = ON')
})

afterAll(() => {
  db.close()
})

describe('template DB schema integrity', () => {
  it('creates all expected tables', () => {
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as Array<{ name: string }>
    const names = tables.map(t => t.name)
    const expected = [
      'meta',
      'resources',
      'stockpiles',
      'survey_log',
      'facilities',
      'facility_buffers',
      'transports',
      'terrain',
      'terrain_modifications',
      'power_lines',
      'battery_banks',
      'humanity',
      'environment',
      'incidents',
      'space_facilities',
      'space_missions',
      'actions',
      'event_log',
      'recipes',
      'recipe_inputs',
      'recipe_outputs',
      'tech_nodes',
      'tech_costs',
      'tech_unlocks',
      'tech_prerequisites',
      'game_research',
    ]
    for (const t of expected) {
      expect(names).toContain(t)
    }
  })

  it('enforces NOT NULL on resources.resource_key', () => {
    expect(() => db.prepare('INSERT INTO resources (resource_key) VALUES (NULL)').run()).toThrow()
  })

  it('enforces NOT NULL on facilities.type', () => {
    expect(() => db.prepare('INSERT INTO facilities (type) VALUES (NULL)').run()).toThrow()
  })

  it('tech_nodes have unique IDs', () => {
    const rows = db.prepare('SELECT id FROM tech_nodes').all() as Array<{ id: string }>
    const ids = rows.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('recipe inputs reference existing recipes', () => {
    const orphans = db.prepare(`
      SELECT ri.recipe_id FROM recipe_inputs ri
      LEFT JOIN recipes r ON ri.recipe_id = r.id
      WHERE r.id IS NULL
    `).all() as Array<{ recipe_id: string }>
    expect(orphans).toHaveLength(0)
  })

  it('recipe outputs reference existing recipes', () => {
    const orphans = db.prepare(`
      SELECT ro.recipe_id FROM recipe_outputs ro
      LEFT JOIN recipes r ON ro.recipe_id = r.id
      WHERE r.id IS NULL
    `).all() as Array<{ recipe_id: string }>
    expect(orphans).toHaveLength(0)
  })

  it('tech_prerequisites reference existing tech_nodes', () => {
    const orphans = db.prepare(`
      SELECT tp.tech_id, tp.prerequisite_id FROM tech_prerequisites tp
      LEFT JOIN tech_nodes tn ON tp.tech_id = tn.id
      LEFT JOIN tech_nodes pn ON tp.prerequisite_id = pn.id
      WHERE tn.id IS NULL OR pn.id IS NULL
    `).all()
    expect(orphans).toHaveLength(0)
  })

  it('recipes.tech_required references existing tech_nodes or is NULL', () => {
    const orphans = db.prepare(`
      SELECT r.id, r.tech_required FROM recipes r
      LEFT JOIN tech_nodes tn ON r.tech_required = tn.id
      WHERE r.tech_required IS NOT NULL AND tn.id IS NULL
    `).all()
    expect(orphans).toHaveLength(0)
  })
})

describe('template DB seed data', () => {
  it('seeds 13 tech nodes', () => {
    const count = db.prepare('SELECT COUNT(*) as n FROM tech_nodes').get() as { n: number }
    expect(count.n).toBe(13)
  })

  it('seeds 17 recipes', () => {
    const count = db.prepare('SELECT COUNT(*) as n FROM recipes').get() as { n: number }
    expect(count.n).toBe(17)
  })

  it('seeds tech prerequisites forming a valid DAG (no cycles)', () => {
    const prereqs = db.prepare('SELECT tech_id, prerequisite_id FROM tech_prerequisites').all() as Array<{ tech_id: string, prerequisite_id: string }>
    expect(prereqs.length).toBeGreaterThanOrEqual(7)

    const adj = new Map<string, string[]>()
    for (const p of prereqs) {
      if (!adj.has(p.tech_id))
        adj.set(p.tech_id, [])
      adj.get(p.tech_id)!.push(p.prerequisite_id)
    }

    const visited = new Set<string>()
    const recStack = new Set<string>()
    function hasCycle(node: string): boolean {
      visited.add(node)
      recStack.add(node)
      const deps = adj.get(node) || []
      for (const dep of deps) {
        if (!visited.has(dep)) {
          if (hasCycle(dep))
            return true
        }
        else if (recStack.has(dep)) {
          return true
        }
      }
      recStack.delete(node)
      return false
    }

    for (const node of adj.keys()) {
      if (!visited.has(node) && hasCycle(node)) {
        expect.fail('Tech prerequisite graph has a cycle')
      }
    }
  })

  it('seeds terrain grid with >60000 cells', () => {
    const count = db.prepare('SELECT COUNT(*) as n FROM terrain').get() as { n: number }
    expect(count.n).toBeGreaterThan(60000)
  })

  it('seeds MRDS deposits with non-zero remaining quantities', () => {
    const count = db.prepare('SELECT COUNT(*) as n FROM resources WHERE lat IS NOT NULL AND remaining > 0').get() as { n: number }
    expect(count.n).toBeGreaterThan(100000)
  })

  it('seeds at least iron recipe I/O pairs', () => {
    const ironInputs = db.prepare(`SELECT * FROM recipe_inputs WHERE recipe_id = 'iron_smelting'`).all()
    const ironOutputs = db.prepare(`SELECT * FROM recipe_outputs WHERE recipe_id = 'iron_smelting'`).all()
    expect(ironInputs.length).toBeGreaterThan(0)
    expect(ironOutputs.length).toBeGreaterThan(0)
  })

  it('every recipe has at least one output', () => {
    const recipes = db.prepare('SELECT id FROM recipes').all() as Array<{ id: string }>
    for (const r of recipes) {
      const outputs = db.prepare('SELECT COUNT(*) as n FROM recipe_outputs WHERE recipe_id = ?').get(r.id) as { n: number }
      expect(outputs.n).toBeGreaterThan(0)
    }
  })

  it('tier-1 tech nodes have no prerequisites', () => {
    const tier1 = db.prepare('SELECT id FROM tech_nodes WHERE tier = 1').all() as Array<{ id: string }>
    for (const t of tier1) {
      const prereqs = db.prepare('SELECT COUNT(*) as n FROM tech_prerequisites WHERE tech_id = ?').get(t.id) as { n: number }
      expect(prereqs.n).toBe(0)
    }
  })

  it('tier-2+ tech nodes have at least one prerequisite', () => {
    const higher = db.prepare('SELECT id FROM tech_nodes WHERE tier >= 2').all() as Array<{ id: string }>
    for (const t of higher) {
      const prereqs = db.prepare('SELECT COUNT(*) as n FROM tech_prerequisites WHERE tech_id = ?').get(t.id) as { n: number }
      expect(prereqs.n).toBeGreaterThanOrEqual(1)
    }
  })
})
