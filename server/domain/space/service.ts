import type { SpaceFacilitySummary, SpaceMission, SpaceSummary } from '../../../lib/types/space'
import { eq } from 'drizzle-orm'
import { createGameDb } from '../../db/client'
import { schema } from '../../db/schema'

export function getSpaceStatus(token: string): SpaceSummary {
  const db = createGameDb(token)

  const facilities = db.select().from(schema.spaceFacilities).all()
  const missions = db.select().from(schema.spaceMissions).all()

  const facilitySummaries: SpaceFacilitySummary[] = facilities.map(f => ({
    id: f.id,
    type: f.type,
    name: f.name,
    status: f.status,
    crewAssigned: f.crewAssigned,
    crewCapacity: f.crewCapacity,
    orbital: Boolean(f.orbital),
  }))

  const missionSummaries: SpaceMission[] = missions.map(m => ({
    id: m.id,
    type: m.type,
    status: m.status,
    target: m.target,
    launchTick: m.launchTick,
    returnTick: m.returnTick,
    payload: m.payload,
    facilityId: m.facilityId,
  }))

  return {
    facilities: facilitySummaries,
    missions: missionSummaries,
  }
}

export function launchMission(
  token: string,
  params: {
    facilityId: number
    missionType: string
    target: string
    payload: string
  },
): { missionId: number } {
  const db = createGameDb(token)

  const meta = db.select().from(schema.meta).where(eq(schema.meta.key, 'game')).get()
  const tick = meta?.tickCount || 0

  const mission = db.insert(schema.spaceMissions).values({
    type: params.missionType,
    status: 'Launched',
    target: params.target,
    launchTick: tick,
    returnTick: null,
    payload: params.payload,
    facilityId: params.facilityId,
  }).returning().get()

  return { missionId: mission.id }
}

export function assignSpaceCrew(
  token: string,
  facilityId: number,
  crewCount: number,
): { success: boolean } {
  const db = createGameDb(token)

  db.update(schema.spaceFacilities)
    .set({ crewAssigned: crewCount })
    .where(eq(schema.spaceFacilities.id, facilityId))
    .run()

  const human = db.select().from(schema.humanity).where(eq(schema.humanity.key, 'global')).get()
  if (human) {
    db.update(schema.humanity)
      .set({ assignedToSpace: human.assignedToSpace + crewCount })
      .where(eq(schema.humanity.key, 'global'))
      .run()
  }

  return { success: true }
}
