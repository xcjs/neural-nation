import type { RegistryEntry } from '../../../lib/types/game'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REGISTRY_PATH = resolve('data', 'games', 'registry.json')

let cache: RegistryEntry[] | null = null

export function ensureDataDir(): void {
  const dir = resolve('data', 'games')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function loadRegistry(): RegistryEntry[] {
  if (cache !== null)
    return cache
  if (!existsSync(REGISTRY_PATH)) {
    cache = []
    return cache
  }
  const raw = readFileSync(REGISTRY_PATH, 'utf-8').replace(/^\uFEFF/, '')
  cache = JSON.parse(raw) as RegistryEntry[]
  return cache
}

export function saveRegistry(entries: RegistryEntry[]): void {
  ensureDataDir()
  cache = entries
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
  const idx = entries.findIndex(e => e.token === token)
  if (idx >= 0) {
    entries[idx] = { ...entries[idx], ...update } as RegistryEntry
    saveRegistry(entries)
  }
}

export function removeFromRegistry(token: string): void {
  const entries = loadRegistry().filter(e => e.token !== token)
  saveRegistry(entries)
}

export function findRegistryEntry(token: string): RegistryEntry | undefined {
  return loadRegistry().find(e => e.token === token)
}

export function findRegistryEntryByPublicToken(
  publicToken: string,
): RegistryEntry | undefined {
  return loadRegistry().find(e => e.publicToken === publicToken)
}

export function clearRegistryCache(): void {
  cache = null
}
