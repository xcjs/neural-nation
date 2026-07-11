import type { RegistryEntry } from '../../../lib/types/game';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDataDir } from '../../db/client';

let REGISTRY_PATH: string | null = null;

function getRegistryPath(): string {
  if (REGISTRY_PATH)
    return REGISTRY_PATH;
  REGISTRY_PATH = resolve(getDataDir(), 'registry.json');
  return REGISTRY_PATH;
}

let cache: RegistryEntry[] | null = null;

export function ensureDataDir(): void {
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadRegistry(): RegistryEntry[] {
  if (cache !== null)
    return cache;
  const path = getRegistryPath();
  if (!existsSync(path)) {
    cache = [];
    return cache;
  }
  const raw = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
  cache = JSON.parse(raw) as RegistryEntry[];
  return cache;
}

export function saveRegistry(entries: RegistryEntry[]): void {
  ensureDataDir();
  cache = entries;
  writeFileSync(getRegistryPath(), JSON.stringify(entries, null, 2), 'utf-8');
}

export function addToRegistry(entry: RegistryEntry): void {
  const entries = loadRegistry();
  entries.push(entry);
  saveRegistry(entries);
}

export function updateRegistryEntry(
  token: string,
  update: Partial<RegistryEntry>,
): void {
  const entries = loadRegistry();
  const idx = entries.findIndex(e => e.token === token);
  if (idx >= 0) {
    entries[idx] = { ...entries[idx], ...update } as RegistryEntry;
    saveRegistry(entries);
  }
}

export function removeFromRegistry(token: string): void {
  const entries = loadRegistry().filter(e => e.token !== token);
  saveRegistry(entries);
}

export function findRegistryEntry(token: string): RegistryEntry | undefined {
  return loadRegistry().find(e => e.token === token);
}

export function findRegistryEntryByPublicToken(
  publicToken: string,
): RegistryEntry | undefined {
  return loadRegistry().find(e => e.publicToken === publicToken);
}

export function clearRegistryCache(): void {
  cache = null;
}
