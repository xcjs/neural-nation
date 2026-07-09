import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import type { TransportSummary } from '../../../lib/types/transport'
import { TransportType } from '../../../lib/types/transport'
import { greatCircleDistance } from '../../shared/geo/distance'
import type { PaginationParams, PaginatedResult } from '../../../lib/types/mcp'

export function buildTransport(
  token: string,
  params: {
    type: TransportType
    fromFacilityId: number
    toFacilityId: number
    resourceKey?: string
  },
): { transportId: number; terrainModifiers: string[] } {
  const db = createGameDb(token)

  const fromFacility = db.select().from(schema.facilities)
    .where(eq(schema.facilities.id, params.fromFacilityId))
    .get()
  const toFacility = db.select().from(schema.facilities)
    .where(eq(schema.facilities.id, params.toFacilityId))
    .get()

  if (!fromFacility || !toFacility) {
    throw new Error('Source or destination facility not found')
  }

  const distance = greatCircleDistance(
    fromFacility.lat,
    fromFacility.lon,
    toFacility.lat,
    toFacility.lon,
  )

  const terrainModifiers = analyzeTerrain(token, fromFacility.lat, fromFacility.lon, toFacility.lat, toFacility.lon)

  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()
  const tick = meta?.tickCount || 0

  const capacity = getTransportCapacity(params.type, distance)

  const transport = db.insert(schema.transports).values({
    type: params.type,
    fromFacilityId: params.fromFacilityId,
    toFacilityId: params.toFacilityId,
    fromLat: fromFacility.lat,
    fromLon: fromFacility.lon,
    toLat: toFacility.lat,
    toLon: toFacility.lon,
    flowRate: 0,
    resourceKey: params.resourceKey || null,
    capacity,
    terrainModifiers: JSON.stringify(terrainModifiers),
    createdAtTick: tick,
  }).returning().get()

  return { transportId: transport.id, terrainModifiers }
}

export function demolishTransport(token: string, transportId: number): { success: boolean } {
  const db = createGameDb(token)
  db.delete(schema.transports).where(eq(schema.transports.id, transportId)).run()
  return { success: true }
}

export function listTransports(
  token: string,
  params: PaginationParams = {},
): PaginatedResult<TransportSummary> {
  const db = createGameDb(token)
  const limit = params.limit || 50
  const offset = params.offset || 0

  const items = db.select().from(schema.transports).limit(limit).offset(offset).all()
  const totalCount = db.select({ count: sql<number>`count(*)` })
    .from(schema.transports)
    .get()?.count || 0

  return {
    items: items.map(mapToSummary),
    totalCount,
    limit,
    offset,
    hasMore: offset + items.length < totalCount,
  }
}

export function assignRoute(
  token: string,
  transportId: number,
  resourceKey: string,
  flowRate: number,
): { success: boolean } {
  const db = createGameDb(token)

  db.update(schema.transports)
    .set({ resourceKey, flowRate })
    .where(eq(schema.transports.id, transportId))
    .run()

  return { success: true }
}

export function getSupplyChainStatus(token: string) {
  const db = createGameDb(token)

  const facilities = db.select().from(schema.facilities).all()
  const transports = db.select().from(schema.transports).all()

  const nodes = facilities.map((f) => ({
    id: f.id,
    type: f.type,
    name: f.name,
    status: f.status,
    throughput: f.throughput,
  }))

  const edges = transports.map((t) => ({
    id: t.id,
    from: t.fromFacilityId,
    to: t.toFacilityId,
    resourceKey: t.resourceKey,
    flowRate: t.flowRate,
    capacity: t.capacity,
  }))

  return { nodes, edges }
}

function analyzeTerrain(
  token: string,
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): string[] {
  const db = createGameDb(token)
  const modifiers: string[] = []

  const latMin = Math.min(fromLat, toLat)
  const latMax = Math.max(fromLat, toLat)
  const lonMin = Math.min(fromLon, toLon)
  const lonMax = Math.max(fromLon, toLon)

  const terrainCells = db.select().from(schema.terrain)
    .where(
      and(
        sql`${schema.terrain.lat} >= ${latMin} AND ${schema.terrain.lat} <= ${latMax}`,
        sql`${schema.terrain.lon} >= ${lonMin} AND ${schema.terrain.lon} <= ${lonMax}`,
      ),
    )
    .all()

  for (const cell of terrainCells) {
    if (cell.terrainClass === 'Mountain' || cell.terrainClass === 'HighMountain') {
      if (!modifiers.includes('tunnel')) modifiers.push('tunnel')
    }
    if (cell.terrainClass === 'Ocean') {
      if (!modifiers.includes('bridge')) modifiers.push('bridge')
    }
  }

  return modifiers
}

function getTransportCapacity(type: TransportType, distanceKm: number): number {
  switch (type) {
    case TransportType.Road:
      return Math.max(10, 100 - distanceKm * 0.1)
    case TransportType.Conveyor:
      return 50
    case TransportType.Pipeline:
      return 200
    case TransportType.PowerLine:
      return 100
    default:
      return 50
  }
}

function mapToSummary(t: typeof schema.transports.$inferSelect): TransportSummary {
  return {
    id: t.id,
    type: t.type as TransportType,
    fromFacilityId: t.fromFacilityId,
    toFacilityId: t.toFacilityId,
    fromLat: t.fromLat,
    fromLon: t.fromLon,
    toLat: t.toLat,
    toLon: t.toLon,
    resourceKey: t.resourceKey,
    flowRate: t.flowRate,
    capacity: t.capacity,
    terrainModifiers: JSON.parse(t.terrainModifiers || '[]'),
  }
}