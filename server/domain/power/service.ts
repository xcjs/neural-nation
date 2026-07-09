import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'
import { eq, sql } from 'drizzle-orm'
import type { PowerGridSummary, PowerLineSummary } from '../../../lib/types/power'
import { GridStatus } from '../../../lib/types/power'
import { greatCircleDistance, transmissionLossPercent } from '../../shared/geo/distance'

export function getPowerGridStatus(token: string): PowerGridSummary {
  const db = createGameDb(token)

  const facilities = db.select().from(schema.facilities).all()
  const powerLines = db.select().from(schema.powerLines).all()

  const generators = facilities.filter((f) => f.type.includes('plant') || f.type.includes('reactor') || f.type.includes('generator') || f.type.includes('farm') || f.type === 'solar_farm' || f.type === 'wind_farm')
  const consumers = facilities.filter((f) => f.powerConsumption > 0)

  const totalCapacity = generators.reduce((sum, g) => sum + (g.targetOutputRate || 0), 0)
  const totalDemand = consumers.reduce((sum, c) => sum + c.powerConsumption, 0)

  let status = GridStatus.Normal
  if (totalDemand > totalCapacity * 0.9) status = GridStatus.Brownout
  if (totalDemand > totalCapacity) status = GridStatus.Blackout

  const lines: PowerLineSummary[] = powerLines.map((line) => {
    const from = facilities.find((f) => f.id === line.fromFacilityId)
    const to = facilities.find((f) => f.id === line.toFacilityId)

    let loss = line.transmissionLoss
    if (from && to && loss === 0) {
      const dist = greatCircleDistance(from.lat, from.lon, to.lat, to.lon)
      loss = transmissionLossPercent(dist)
    }

    return {
      id: line.id,
      fromFacilityId: line.fromFacilityId,
      toFacilityId: line.toFacilityId,
      capacity: line.capacity,
      load: line.load,
      transmissionLoss: loss,
    }
  })

  const connectedComponents = computeConnectedComponents(facilities.map((f) => f.id), powerLines)

  return {
    totalCapacity,
    totalDemand,
    status,
    lines,
    connectedGrids: connectedComponents,
  }
}

function computeConnectedComponents(
  facilityIds: number[],
  powerLines: Array<{ fromFacilityId: number; toFacilityId: number }>,
): number[][] {
  const adj = new Map<number, Set<number>>()
  for (const id of facilityIds) {
    adj.set(id, new Set())
  }
  for (const line of powerLines) {
    adj.get(line.fromFacilityId)?.add(line.toFacilityId)
    adj.get(line.toFacilityId)?.add(line.fromFacilityId)
  }

  const visited = new Set<number>()
  const components: number[][] = []

  for (const id of facilityIds) {
    if (visited.has(id)) continue
    const component: number[] = []
    const queue = [id]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      component.push(current)
      for (const neighbor of adj.get(current) || new Set()) {
        if (!visited.has(neighbor)) queue.push(neighbor)
      }
    }
    components.push(component)
  }

  return components
}