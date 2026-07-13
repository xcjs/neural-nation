import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const dataDir = process.env.NN_DATA_DIR ?? resolve('data', 'games');

interface RegistryEntry {
  token: string;
  publicToken: string;
  status: string;
}

function isTemplate(file: string): boolean {
  return file === '_template.db' || file === '_template.db-shm' || file === '_template.db-wal';
}

function pruneRegistry(removedTokens: Set<string>): number {
  const registryPath = resolve(dataDir, 'registry.json');
  if (!existsSync(registryPath))
    return 0;

  const entries = JSON.parse(readFileSync(registryPath, 'utf-8')) as RegistryEntry[];
  const kept = entries.filter((e) => {
    if (removedTokens.has(e.token))
      return false;
    // Also prune entries whose DB no longer exists
    return existsSync(resolve(dataDir, `${e.token}.db`));
  });
  if (kept.length !== entries.length) {
    writeFileSync(registryPath, JSON.stringify(kept, null, 2));
    return entries.length - kept.length;
  }
  return 0;
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

  let removed = 0;
  let freed = 0;
  const removedTokens = new Set<string>();
  for (const file of targets) {
    const path = resolve(dataDir, file);
    try {
      const size = statSync(path).size;
      rmSync(path, { force: true });
      removed++;
      freed += size;
      const token = file.replace(/\.(?:db|db-shm|db-wal)$/, '');
      if (!token.startsWith('_'))
        removedTokens.add(token);
    }
    catch {
      // ignore individual file errors
    }
  }

  const pruned = pruneRegistry(removedTokens);
  const mb = (freed / 1048576).toFixed(1);
  const registryMsg = pruned > 0 ? `, pruned ${pruned} registry session(s)` : '';
  if (removed === 0 && pruned === 0) {
    console.warn('Nothing to clean.');
    return;
  }
  console.warn(`Removed ${removed} file(s) from ${dataDir} (freed ${mb} MB${registryMsg}). _template.db preserved.`);
}

main();
