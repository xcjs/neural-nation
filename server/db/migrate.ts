import type Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const MIGRATIONS_DIR = resolve(process.cwd(), 'server', 'db', 'migrations');

interface MigrationFile {
  id: number;
  filename: string;
  sql: string;
}

function loadMigrations(): MigrationFile[] {
  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
  }
  catch {
    return [];
  }
  return files
    .map((filename) => {
      const match = filename.match(/^(\d+)_/);
      if (!match)
        return null;
      return {
        id: Number.parseInt(match[1]!, 10),
        filename,
        sql: readFileSync(resolve(MIGRATIONS_DIR, filename), 'utf-8'),
      };
    })
    .filter((m): m is MigrationFile => m !== null)
    .sort((a, b) => a.id - b.id);
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
  const migrations = loadMigrations();
  const applied = getAppliedMigrations(sqlite);
  const newlyApplied: string[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.id))
      continue;
    sqlite.exec(migration.sql);
    sqlite.prepare('INSERT INTO _migrations (id, filename, applied_at) VALUES (?, ?, ?)').run(
      migration.id,
      migration.filename,
      new Date().toISOString(),
    );
    newlyApplied.push(migration.filename);
  }

  return { applied: newlyApplied, skipped: migrations.length - newlyApplied.length };
}
