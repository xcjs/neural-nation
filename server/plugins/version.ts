import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime';

export default defineNitroPlugin(() => {
  const path = resolve(process.cwd(), 'package.json');
  const raw = readFileSync(path, 'utf-8');
  const { version } = JSON.parse(raw);

  const config = useRuntimeConfig();
  config.public.version = version;
});
