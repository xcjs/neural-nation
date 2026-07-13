import { readdirSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const dataDir = process.env.NN_DATA_DIR ?? resolve('data', 'games');

function isTemplate(file: string): boolean {
  return file === '_template.db' || file === '_template.db-shm' || file === '_template.db-wal';
}

function main(): void {
  let dir: string[];
  try {
    dir = readdirSync(dataDir);
  }
  catch {
    console.warn(`No data directory found at ${dataDir} — nothing to clean.`);
    return;
  }

  const targets = dir.filter(f => /\.(?:db|db-shm|db-wal)$/.test(f) && !isTemplate(f));

  if (targets.length === 0) {
    console.warn('No game databases to clean.');
    return;
  }

  let removed = 0;
  let freed = 0;
  for (const file of targets) {
    const path = resolve(dataDir, file);
    try {
      const size = statSync(path).size;
      rmSync(path, { force: true });
      removed++;
      freed += size;
    }
    catch {
      // ignore individual file errors
    }
  }

  const mb = (freed / 1048576).toFixed(1);
  console.warn(`Removed ${removed} file(s) from ${dataDir} (freed ${mb} MB). _template.db preserved.`);
}

main();
