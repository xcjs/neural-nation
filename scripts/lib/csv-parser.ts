/**
 * Minimal CSV parser supporting quoted fields and embedded commas/newlines.
 *
 * Two modes:
 *  - parseCsvFile: streams a (optionally gzipped) CSV file from disk.
 *  - parseCsvString: parses an in-memory string synchronously.
 */
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createUnzip } from 'node:zlib'

export interface CsvRow {
  [key: string]: string
}

/** Parse a single CSV line into fields, handling quotes and embedded commas. */
export function parseLine(line: string): string[] {
  const fields: string[] = []
  let i = 0
  let field = ''
  let inQuotes = false

  while (i < line.length) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i += 2
        }
        else {
          inQuotes = false
          i++
        }
      }
      else {
        field += ch
        i++
      }
    }
    else {
      if (ch === '"') {
        inQuotes = true
        i++
      }
      else if (ch === ',') {
        fields.push(field)
        field = ''
        i++
      }
      else {
        field += ch
        i++
      }
    }
  }

  fields.push(field)
  return fields
}

/** Build a row object from a parsed field array using the given headers. */
function buildRow(fields: string[], headers: string[]): CsvRow {
  const row: CsvRow = {}
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]!] = fields[i] ?? ''
  }
  return row
}

/**
 * Synchronously parse a CSV string and yield rows keyed by header.
 * Handles multi-line quoted fields.
 */
export function* parseCsvString(content: string): Generator<CsvRow, void, unknown> {
  const lines = content.split('\n')
  let headers: string[] | null = null
  let buffer = ''

  for (const line of lines) {
    // Strip trailing \r
    const clean = line.endsWith('\r') ? line.slice(0, -1) : line

    buffer = buffer ? `${buffer}\n${clean}` : clean

    // If buffer has an odd number of quotes, row spans multiple lines
    const quoteCount = (buffer.match(/"/g) || []).length
    if (quoteCount % 2 !== 0)
      continue

    const fields = parseLine(buffer)
    buffer = ''

    if (headers === null) {
      headers = fields
      continue
    }

    yield buildRow(fields, headers)
  }

  if (buffer.trim()) {
    const fields = parseLine(buffer)
    if (headers && fields.length > 0) {
      yield buildRow(fields, headers)
    }
  }
}

/**
 * Parse a CSV file (optionally gzipped) and yield rows as objects keyed by header.
 * For .zip files, caller must extract first — this only handles plain or .gz CSVs.
 */
export async function* parseCsvFile(
  filePath: string,
  options: { gzip?: boolean } = {},
): AsyncGenerator<CsvRow, void, unknown> {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const source = options.gzip ? stream.pipe(createUnzip()) : stream

  const rl = createInterface({ input: source as any, crlfDelay: Infinity })

  let headers: string[] | null = null
  let buffer = ''
  let pendingResolve: ((line: string | null) => void) | null = null

  const lineQueue: string[] = []
  const lineEvent = () => {
    if (pendingResolve) {
      const resolve = pendingResolve
      pendingResolve = null
      const line = lineQueue.shift() ?? null
      resolve(line)
    }
  }

  rl.on('line', (line: string) => {
    lineQueue.push(line)
    lineEvent()
  })

  const nextLine = (): Promise<string | null> => {
    if (lineQueue.length > 0)
      return Promise.resolve(lineQueue.shift()!)
    if ((rl as any).destroyed)
      return Promise.resolve(null)
    return new Promise((resolve) => {
      pendingResolve = resolve
    })
  }

  try {
    while (true) {
      const line = await nextLine()
      if (line === null)
        break

      buffer = buffer ? `${buffer}\n${line}` : line

      const quoteCount = (buffer.match(/"/g) || []).length
      if (quoteCount % 2 !== 0)
        continue

      const fields = parseLine(buffer)
      buffer = ''

      if (headers === null) {
        headers = fields
        continue
      }

      yield buildRow(fields, headers)
    }

    if (buffer.trim()) {
      const fields = parseLine(buffer)
      if (headers && fields.length > 0) {
        yield buildRow(fields, headers)
      }
    }
  }
  finally {
    rl.close()
  }
}
