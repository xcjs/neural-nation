import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
/**
 * Zip utilities — extract entries from .zip archives without native unzip.
 * Uses adm-zip (pure JS).
 */
import AdmZip from 'adm-zip'

/** Extract a single entry from a zip archive to a target path. */
export function extractZipEntry(zipPath: string, entryName: string, destPath: string): string | null {
  if (!existsSync(zipPath))
    return null

  const zip = new AdmZip(zipPath)
  const entry = zip.getEntry(entryName)
  if (!entry)
    return null

  mkdirSync(dirname(destPath), { recursive: true })
  zip.extractEntryTo(entry, destPath, false, true)
  return destPath
}

/** List all entries in a zip archive. */
export function listZipEntries(zipPath: string): Array<{ name: string, size: number }> {
  if (!existsSync(zipPath))
    return []
  const zip = new AdmZip(zipPath)
  return zip.getEntries().map(e => ({ name: e.entryName, size: e.header.size }))
}

/** Read a zip entry as a string. Returns null if entry not found. */
export function readZipEntryAsString(zipPath: string, entryName: string): string | null {
  if (!existsSync(zipPath))
    return null
  const zip = new AdmZip(zipPath)
  const entry = zip.getEntry(entryName)
  if (!entry)
    return null
  return entry.getData().toString('utf8')
}

/** Write a buffer to disk, creating parent dirs as needed. */
export function writeBuffer(path: string, data: Buffer): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}
