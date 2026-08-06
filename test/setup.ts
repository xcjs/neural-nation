import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { afterAll } from 'vitest';
import { closeAllGameDbs } from '../server/db/client';
import { closeAllDbs } from '../server/domains/db/DbFactory';

// Each worker process gets its own isolated data directory to prevent
// registry.json and game DB race conditions when tests run in parallel.
const tmpBase = resolve(process.env.TEMP || process.env.TMP || '.', 'nn-test-data');
const workerDir = resolve(tmpBase, `worker-${process.pid}`);

if (!existsSync(workerDir)) {
  mkdirSync(workerDir, { recursive: true });
}

// Copy template DB into worker dir if it doesn't exist there
const templateSrc = resolve('data', 'games', '_template.db');
const templateDst = resolve(workerDir, '_template.db');
if (existsSync(templateSrc) && !existsSync(templateDst)) {
  copyFileSync(templateSrc, templateDst);
}

process.env.NN_DATA_DIR = workerDir;

// Close all better-sqlite3 handles after every test file. Without this,
// Node tears down the worker thread's V8 environment while live Statement
// objects still reference native cleanup hooks, which triggers the
// `RemoveEnvironmentCleanupHook` assertion in better_sqlite3.node
// (crashes the worker under Node 24 / vitest tinypool).
// `afterAll` (not `process.on('exit')`) is required because vitest's
// default threads pool tears down worker V8 environments before the
// main process exits.
afterAll(() => {
  try {
    closeAllDbs();
  }
  catch {
    // ignore — best-effort cleanup
  }
  try {
    closeAllGameDbs();
  }
  catch {
    // ignore — best-effort cleanup
  }
});
