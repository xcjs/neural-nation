import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..', '..')

export interface ClimateTextureResult {
  width: number
  height: number
  cellsProcessed: number
  outputPath: string
}

const KG_PATH = join(root, 'data', 'geological', 'raw', 'Koeppen-Geiger-ASCII.txt')
const OUTPUT_PATH = join(root, 'public', 'data', 'geological', 'forest-density.json')

const CANVAS_W = 720
const CANVAS_H = 360

const CLIMATE_FOREST_DENSITY: Record<string, number> = {
  Af: 1.0,
  Am: 1.0,
  As: 0.5,
  Aw: 0.5,
  BSh: 0.1,
  BSk: 0.1,
  BWh: 0.0,
  BWk: 0.0,
  Cfa: 0.8,
  Cfb: 0.8,
  Cfc: 0.7,
  Csa: 0.5,
  Csb: 0.5,
  Csc: 0.4,
  Cwa: 0.5,
  Cwb: 0.5,
  Cwc: 0.4,
  Dfa: 0.6,
  Dfb: 0.6,
  Dfc: 0.55,
  Dfd: 0.5,
  Dsa: 0.4,
  Dsb: 0.4,
  Dsc: 0.35,
  Dsd: 0.3,
  Dwa: 0.4,
  Dwb: 0.4,
  Dwc: 0.35,
  Dwd: 0.3,
  ET: 0.15,
  EF: 0.0,
}

function climateToForestDensity(code: string): number {
  if (CLIMATE_FOREST_DENSITY[code] !== undefined)
    return CLIMATE_FOREST_DENSITY[code]!
  if (code.length >= 1) {
    const first = code[0]!
    if (first === 'A')
      return 0.7
    if (first === 'B')
      return 0.05
    if (first === 'C')
      return 0.6
    if (first === 'D')
      return 0.4
    if (first === 'E')
      return 0.05
  }
  return 0.3
}

export interface ForestGridCell {
  latIndex: number
  lonIndex: number
  density: number
  maxDensity: number
}

export function getForestGridCells(): ForestGridCell[] {
  if (!existsSync(KG_PATH)) {
    throw new Error(`Köppen-Geiger data not found at ${KG_PATH}. Run 'npm run fetch:data' first.`)
  }

  const text = readFileSync(KG_PATH, 'utf-8')
  const lines = text.trim().split('\n')
  const dataLines = lines.filter(l => !l.startsWith('Lat') && l.trim().length > 0)

  const grid = new Float32Array(CANVAS_W * CANVAS_H).fill(0)

  for (const line of dataLines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3)
      continue
    const lat = Number.parseFloat(parts[0]!)
    const lon = Number.parseFloat(parts[1]!)
    const cls = parts[2]!.trim()
    if (isNaN(lat) || isNaN(lon))
      continue

    const density = climateToForestDensity(cls)
    if (density <= 0)
      continue

    const x = Math.floor(((lon + 180) / 360) * CANVAS_W)
    const y = Math.floor(((90 - lat) / 180) * CANVAS_H)
    if (x < 0 || x >= CANVAS_W || y < 0 || y >= CANVAS_H)
      continue

    const idx = y * CANVAS_W + x
    if (density > grid[idx]!)
      grid[idx] = density
  }

  const cells: ForestGridCell[] = []
  for (let y = 0; y < CANVAS_H; y++) {
    for (let x = 0; x < CANVAS_W; x++) {
      const d = grid[y * CANVAS_W + x]!
      if (d > 0) {
        cells.push({ latIndex: y, lonIndex: x, density: d, maxDensity: d })
      }
    }
  }
  return cells
}

export function buildForestDensityData(outputPath?: string): ClimateTextureResult {
  if (!existsSync(KG_PATH)) {
    throw new Error(`Köppen-Geiger data not found at ${KG_PATH}. Run 'npm run fetch:data' first.`)
  }

  const text = readFileSync(KG_PATH, 'utf-8')
  const lines = text.trim().split('\n')
  const dataLines = lines.filter(l => !l.startsWith('Lat') && l.trim().length > 0)

  const outDir = dirname(outputPath ?? OUTPUT_PATH)
  mkdirSync(outDir, { recursive: true })

  const grid = new Float32Array(CANVAS_W * CANVAS_H).fill(0)
  let cellsProcessed = 0

  for (const line of dataLines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3)
      continue
    const lat = Number.parseFloat(parts[0]!)
    const lon = Number.parseFloat(parts[1]!)
    const cls = parts[2]!.trim()
    if (isNaN(lat) || isNaN(lon))
      continue

    const density = climateToForestDensity(cls)
    if (density <= 0)
      continue

    const x = Math.floor(((lon + 180) / 360) * CANVAS_W)
    const y = Math.floor(((90 - lat) / 180) * CANVAS_H)
    if (x < 0 || x >= CANVAS_W || y < 0 || y >= CANVAS_H)
      continue

    const idx = y * CANVAS_W + x
    if (density > grid[idx]!)
      grid[idx] = density

    cellsProcessed++
  }

  const out = outputPath ?? OUTPUT_PATH
  const json = JSON.stringify({ width: CANVAS_W, height: CANVAS_H, data: Array.from(grid) })
  writeFileSync(out, json, 'utf-8')

  return { width: CANVAS_W, height: CANVAS_H, cellsProcessed, outputPath: out }
}
