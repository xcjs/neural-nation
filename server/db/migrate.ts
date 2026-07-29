import type Database from 'better-sqlite3';

interface MigrationFile {
  id: number;
  filename: string;
  sql: string;
}

// Migrations are inlined as string constants so they are bundled into the
// Nitro production build (the source server/db/migrations directory is not
// present in .output). Keep these in sync with the .sql files of the same id
// under server/db/migrations/.
const MIGRATIONS: MigrationFile[] = [
  {
    id: 1,
    filename: '001_pollution_grid.sql',
    sql: [
      'CREATE TABLE IF NOT EXISTS pollution_grid (',
      '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
      '  lat_index INTEGER NOT NULL,',
      '  lon_index INTEGER NOT NULL,',
      '  pollution REAL DEFAULT 0',
      ');',
      'CREATE INDEX IF NOT EXISTS idx_pollution_grid_lat_lon ON pollution_grid(lat_index, lon_index);',
    ].join('\n'),
  },
  {
    id: 2,
    filename: '002_power_throttle.sql',
    sql: [
      'ALTER TABLE facilities ADD COLUMN power_throttle REAL DEFAULT 1 NOT NULL;',
      'DROP TABLE IF EXISTS power_lines;',
    ].join('\n'),
  },
];

// The 001 seed inserts 360x720 rows via a recursive CTE. Some SQLite builds
// throw "circular reference" when parsing the CTE inside a subquery even if
// the WHERE NOT EXISTS guard makes the insert a no-op. So we seed in TS:
// only when the table is empty, avoiding the CTE parse issue entirely.
function seedPollutionGridIfEmpty(sqlite: Database.Database): void {
  const row = sqlite.prepare('SELECT COUNT(*) as n FROM pollution_grid').get() as { n: number };
  if (row.n > 0)
    return;

  sqlite.exec(`
    WITH RECURSIVE lat_seq(x) AS (
      SELECT 0 UNION ALL SELECT x + 1 FROM lat_seq WHERE x < 359
    ),
    lon_seq(y) AS (
      SELECT 0 UNION ALL SELECT y + 1 FROM lon_seq WHERE y < 719
    )
    INSERT INTO pollution_grid (lat_index, lon_index, pollution)
    SELECT x, y, 0 FROM lat_seq CROSS JOIN lon_seq;
  `);

  sqlite.prepare("UPDATE environment SET pollution_level = 0 WHERE key = 'global'").run();
}

function ensureMigrationsTable(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function getAppliedMigrations(sqlite: Database.Database): Set<number> {
  const rows = sqlite.prepare('SELECT id FROM _migrations').all() as Array<{ id: number }>;
  return new Set(rows.map(r => r.id));
}

export function runMigrations(sqlite: Database.Database): { applied: string[]; skipped: number } {
  ensureMigrationsTable(sqlite);
  const applied = getAppliedMigrations(sqlite);
  const newlyApplied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id))
      continue;
    sqlite.exec(migration.sql);
    if (migration.id === 1) {
      seedPollutionGridIfEmpty(sqlite);
    }
    sqlite.prepare('INSERT INTO _migrations (id, filename, applied_at) VALUES (?, ?, ?)').run(
      migration.id,
      migration.filename,
      new Date().toISOString(),
    );
    newlyApplied.push(migration.filename);
  }

  return { applied: newlyApplied, skipped: MIGRATIONS.length - newlyApplied.length };
}