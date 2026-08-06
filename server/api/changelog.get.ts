import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => {
  try {
    const path = resolve(process.cwd(), 'CHANGELOG.json');
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw);
  }
  catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { status: 404, error: 'Changelog not found' };
    }
    return { status: 500, error: 'Invalid changelog format' };
  }
});
