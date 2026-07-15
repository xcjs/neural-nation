import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => {
  const path = resolve(process.cwd(), 'CHANGELOG.json');
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
});
