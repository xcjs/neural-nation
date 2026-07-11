import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

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
