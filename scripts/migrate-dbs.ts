import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { runMigrations } from '../server/db/migrate';

const dataDir = process.env.NN_DATA_DIR ?? resolve('data', 'games');

function isTemplate(file: string): boolean {
  return file.startsWith('_template');
}

function main(): void {
  let files: string[];
  try {
    files = readdirSync(dataDir);
  }
  catch {
    console.warn(`No data directory found at ${dataDir}`);
    return;
  }

  const dbs = files.filter(f => f.endsWith('.db') && !isTemplate(f));

  if (dbs.length === 0) {
    console.log('No game databases found to migrate.');
    return;
  }

  let migrated = 0;
  let skipped = 0;
  for (const file of dbs) {
    const path = resolve(dataDir, file);
    try {
      const sqlite = new Database(path);
      const result = runMigrations(sqlite);
      sqlite.close();
      if (result.applied.length > 0) {
        console.log(`  ${file}: applied ${result.applied.join(', ')}`);
        migrated++;
      }
      else {
        console.log(`  ${file}: up to date`);
        skipped++;
      }
    }
    catch (err) {
      console.error(`  ${file}: FAILED — ${err}`);
    }
  }

  console.log(`\nDone: ${migrated} migrated, ${skipped} already up to date.`);
}

main();
