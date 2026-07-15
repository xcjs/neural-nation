import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import changelogHandler from './changelog.get';

const tmpDir = resolve(process.env.TEMP || process.env.TMP || '.', 'nn-changelog-test');
const origCwd = process.cwd();

beforeAll(() => {
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }
  writeFileSync(
    resolve(tmpDir, 'CHANGELOG.json'),
    JSON.stringify([
      {
        version: '1.0.0',
        date: '2026-01-01',
        summary: 'Test version',
        changes: { added: ['Feature A'], fixed: ['Bug B'] },
      },
    ]),
  );
  process.chdir(tmpDir);
});

afterAll(() => {
  process.chdir(origCwd);
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('gET /api/changelog', () => {
  it('returns parsed changelog entries', async () => {
    const result = await changelogHandler({} as never);
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].version).toBe('1.0.0');
    expect(result[0].changes.added).toContain('Feature A');
    expect(result[0].changes.fixed).toContain('Bug B');
  });
});
