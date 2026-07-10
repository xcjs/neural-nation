import { actions } from './action'
import { events } from './event'
import { facilities, facilityBuffers } from './facility'
import { environment, forestGrid, humanity, incidents } from './humanity'
import { meta } from './meta'
import { batteryBanks, powerLines } from './power'
import { resources, stockpiles, surveyLog } from './resource'
import { spaceFacilities, spaceMissions } from './space'
import {
  gameResearch,
  recipeInputs,
  recipeOutputs,
  recipes,
  techCosts,
  techNodes,
  techPrerequisites,
  techUnlocks,
} from './tech'
import { terrain, terrainModifications } from './terrain'
import { transports } from './transport'

export const schema = {
  meta,
  resources,
  stockpiles,
  surveyLog,
  facilities,
  facilityBuffers,
  transports,
  terrain,
  terrainModifications,
  powerLines,
  batteryBanks,
  humanity,
  environment,
  forestGrid,
  incidents,
  spaceFacilities,
  spaceMissions,
  actions,
  events,
  recipes,
  recipeInputs,
  recipeOutputs,
  techNodes,
  techCosts,
  techUnlocks,
  techPrerequisites,
  gameResearch,
}

export {
  actions,
  batteryBanks,
  environment,
  events,
  facilities,
  facilityBuffers,
  forestGrid,
  gameResearch,
  humanity,
  incidents,
  meta,
  powerLines,
  recipeInputs,
  recipeOutputs,
  recipes,
  resources,
  spaceFacilities,
  spaceMissions,
  stockpiles,
  surveyLog,
  techCosts,
  techNodes,
  techPrerequisites,
  techUnlocks,
  terrain,
  terrainModifications,
  transports,
}
