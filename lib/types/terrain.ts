export enum TerrainClass {
  Ocean = 'Ocean',
  Coastal = 'Coastal',
  Plain = 'Plain',
  Hill = 'Hill',
  Mountain = 'Mountain',
  HighMountain = 'HighMountain',
}

export interface ElevationData {
  lat: number
  lon: number
  elevation: number
  terrainClass: TerrainClass
}

export interface TerrainCell {
  latIndex: number
  lonIndex: number
  lat: number
  lon: number
  baseElevation: number
  effectiveElevation: number
  terrainClass: TerrainClass
  modified: boolean
}

export interface TerrainModification {
  id: number
  latIndex: number
  lonIndex: number
  elevationDelta: number
  newTerrainClass: TerrainClass | null
  modifiedBy: string
  modifiedAtTick: number
  operationId: string
  reason: string
}

export enum TerraformAction {
  FlattenTerrain = 'flatten_terrain',
  DigCanal = 'dig_canal',
  BuildRoadEmbankment = 'build_road_embankment',
  CreateReservoir = 'create_reservoir',
  DrainArea = 'drain_area',
  DivertRiver = 'divert_river',
  LevelMountain = 'level_mountain',
  RaiseLand = 'raise_land',
  ExcavateMineShaft = 'excavate_mine_shaft',
  CreateMountain = 'create_mountain',
  ShiftContinentalPlate = 'shift_continental_plate',
  OceanToLand = 'ocean_to_land',
  LandToOcean = 'land_to_ocean',
}
