import { existsSync, unlinkSync } from 'node:fs'
import { GameStatus } from '~/lib/types/game'
import { closeGameDb, getGameDbPath } from '~/server/db/client'
import {
  loadRegistry,
  removeFromRegistry,
  saveRegistry,
  updateRegistryEntry,
} from './registry'

interface CleanupOptions {
  ageDays: number
  graceDays: number
}

export async function runCleanup(opts: CleanupOptions): Promise<{ cleaned: number, pending: number }> {
  const registry = loadRegistry()
  const now = Date.now()
  const ageMs = opts.ageDays * 24 * 60 * 60 * 1000
  const graceMs = opts.graceDays * 24 * 60 * 60 * 1000

  let cleaned = 0
  let pending = 0

  for (const entry of registry) {
    const lastActive = new Date(entry.lastActive).getTime()
    const age = now - lastActive

    if (age < ageMs)
      continue

    // Game is old enough — check if already pending
    if (entry.status === GameStatus.PendingCleanup) {
      const eligibleAt = entry.cleanupEligibleAt ? new Date(entry.cleanupEligibleAt).getTime() : 0
      if (now >= eligibleAt) {
        // Grace period passed — delete
        deleteGame(entry.token)
        cleaned++
      }
      else {
        pending++
      }
    }
    else if (entry.status === GameStatus.GameOver || age >= ageMs) {
      // Mark as pending cleanup
      updateRegistryEntry(entry.token, {
        status: GameStatus.PendingCleanup,
        cleanupEligibleAt: new Date(now + graceMs).toISOString(),
      })
      pending++
    }
  }

  saveRegistry(registry)
  return { cleaned, pending }
}

function deleteGame(token: string): void {
  // Close DB connection if open
  closeGameDb(token)

  // Delete .db, .db-wal, .db-shm files
  const basePath = getGameDbPath(token)
  const files = [basePath, `${basePath}-wal`, `${basePath}-shm`]
  for (const file of files) {
    if (existsSync(file)) {
      try {
        unlinkSync(file)
      }
      catch {
        // ignore
      }
    }
  }

  // Remove from registry
  removeFromRegistry(token)
}
