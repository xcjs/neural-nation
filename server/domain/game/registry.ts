import { resolve } from 'node:path'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { RegistryEntry } from '../../../lib/types/game'
import { GameStatus } from '../../../lib/types/game'

const REGISTRY_PATH = resolve('data', 'games', 'registry.json')

export function ensureDataDir(): void {
  const dir = resolve('data', 'games')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function loadRegistry(): RegistryEntry[] {
  if (!existsSync(REGISTRY_PATH)) {
    return []
  }
  const raw = readFileSync(REGISTRY_PATH, 'utf-8')
  return JSON.parse(raw) as RegistryEntry[]
}

export function saveRegistry(entries: RegistryEntry[]): void {
  ensureDataDir()
  writeFileSync(REGISTRY_PATH, JSON.stringify(entries, null, 2), 'utf-8')
}

export function addToRegistry(entry: RegistryEntry): void {
  const entries = loadRegistry()
  entries.push(entry)
  saveRegistry(entries)
}

export function updateRegistryEntry(
  token: string,
  update: Partial<RegistryEntry>,
): void {
  const entries = loadRegistry()
  const idx = entries.findIndex((e) => e.token === token)
  if (idx >= 0) {
    entries[idx] = { ...entries[idx], ...update }
    saveRegistry(entries)
  }
}

export function removeFromRegistry(token: string): void {
  const entries = loadRegistry().filter((e) => e.token !== token)
  saveRegistry(entries)
}

export function findRegistryEntry(token: string): RegistryEntry | undefined {
  return loadRegistry().find((e) => e.token === token)
}

export function findRegistryEntryByPublicToken(
  publicToken: string,
): RegistryEntry | undefined {
  return loadRegistry().find((e) => e.publicToken === publicToken)
}