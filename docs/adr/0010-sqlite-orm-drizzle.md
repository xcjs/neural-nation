# ADR-0010: SQLite ORM (Drizzle)

| Field | Value |
|---|---|
| Status | Proposed |
| Date | 2026-07-08 |
| Deciders | Project owner |

## Context

The game uses one SQLite database per game (ADR-0005), with a shared schema
defined across many tables (`resources`, `facilities`, `transports`, etc.).
Raw SQL strings in TypeScript are error-prone — no type safety on column
names, no compile-time schema validation, and refactoring schema changes
requires hunting through string literals. We need a type-safe ORM/query
builder that works well with SQLite and TypeScript.

## Decision

Use **Drizzle ORM** (`drizzle-orm` + `drizzle-kit`) as the SQLite ORM and
schema management tool, paired with `better-sqlite3` as the underlying driver.

### Why Drizzle

- **Type-safe schema definitions**: Schema defined in TypeScript files
  (`server/db/schema/*.ts`), giving full type inference on queries and result
  rows.
- **SQL-like query builder**: Drizzle's API mirrors SQL closely — no hidden
  magic, no N+1 surprises. You see exactly what SQL runs.
- **SQLite-native**: First-class `better-sqlite3` driver support via
  `drizzle-orm/better-sqlite3`. Synchronous API matches `better-sqlite3`'s
  execution model.
- **Migration management**: `drizzle-kit` generates and manages SQL migration
  files from schema changes. Migrations are version-controlled SQL files.
- **Lightweight**: No heavy runtime overhead; Drizzle is a thin layer over
  the driver. No decorators, no reflect-metadata, no opaque runtime behavior.
- **Rels/transactions**: Supports relational queries and explicit
  transactions (important for the tick loop's multi-table writes).

### Schema Organization

```
server/db/
  schema/
    meta.ts          ← meta table
    resources.ts     ← resource deposits
    facilities.ts    ← facilities + inputs/outputs
    transports.ts    ← transport links + flows
    stockpiles.ts    ← stockpile state
    survey.ts        ← survey log
    events.ts        ← event log
    index.ts         ← re-exports all tables
  client.ts          ← GameDatabase wrapper (creates drizzle instance per game)
  template.ts        ← template DB creation logic (ADR-0011)
```

### Usage Pattern

```typescript
// server/db/schema/resources.ts
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'

export const resources = sqliteTable('resources', {
  id: integer('id').primaryKey(),
  resourceType: text('resource_type'),
  resourceKey: text('resource_key'),
  lat: real('lat'),
  lon: real('lon'),
  quantity: real('quantity'),
  grade: real('grade'),
  discovered: integer('discovered').default(0),
})

// In game logic:
import { eq } from 'drizzle-orm'
const ironDeposits = await db.select().from(resources)
  .where(eq(resources.resourceKey, 'Fe'))
```

### Per-Game DB Instantiation

Each game gets its own Drizzle instance bound to its own `better-sqlite3`
connection:

```typescript
// server/db/client.ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'

export function createGameDb(token: string) {
  const sqlite = new Database(`data/games/${token}.db`)
  sqlite.pragma('journal_mode = WAL')
  return drizzle(sqlite, { schema })
}
```

## Consequences

**Positive:**
- Full TypeScript type safety on all database queries.
- Schema is code — version-controlled, diffable, refactorable.
- `drizzle-kit` handles migration generation; no hand-written SQL migrations
  for schema changes (though raw SQL migrations remain available for complex
  data migrations like seeding the template DB).
- Drizzle is well-maintained, popular in the Nuxt/Nitro ecosystem, and has
  good documentation.

**Negative:**
- Drizzle's relational query API (`with` / `db.query`) has some rough edges
  with SQLite; may need raw SQL for complex joins.
- `drizzle-kit` migration generation requires running a CLI tool during
  development; adds a build step.
- Learning curve for developers unfamiliar with the query builder API (though
  it's close to SQL, so minimal).

## Alternatives Considered

- **Raw SQL with template strings**: No type safety, no schema validation.
  Rejected — the schema is complex enough to warrant an ORM.
- **Kysely**: Type-safe query builder (not a full ORM). Strong alternative,
  but Drizzle's migration tooling and SQLite-specific ergonomics edge it out.
- **Prisma**: Heavy runtime, generated client, opaque behavior, and
  historically weaker SQLite support. Rejected for being too heavy and
  opinionated for this use case.
- **Knex**: Mature query builder but less type-safe than Drizzle/Kysely.
  Rejected.