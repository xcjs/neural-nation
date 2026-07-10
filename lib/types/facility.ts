export enum FacilityType {
  Extractor = 'Extractor',
  Farm = 'Farm',
  Forestry = 'Forestry',
  WaterPump = 'WaterPump',
  Processor = 'Processor',
  Smelter = 'Smelter',
  Refinery = 'Refinery',
  ChemicalPlant = 'ChemicalPlant',
  Factory = 'Factory',
  AdvancedFactory = 'AdvancedFactory',
  ResearchLab = 'ResearchLab',
  PowerPlant = 'PowerPlant',
  SolarFarm = 'SolarFarm',
  WindFarm = 'WindFarm',
  HydroPlant = 'HydroPlant',
  NuclearReactor = 'NuclearReactor',
  BreederReactor = 'BreederReactor',
  FusionReactor = 'FusionReactor',
  BiomassPlant = 'BiomassPlant',
  BiogasPlant = 'BiogasPlant',
  EthanolRefinery = 'EthanolRefinery',
  SoylentPlant = 'SoylentPlant',
  DieselGenerator = 'DieselGenerator',
  CoalPlant = 'CoalPlant',
  GasPlant = 'GasPlant',
  OilPlant = 'OilPlant',
  GeothermalPlant = 'GeothermalPlant',
  Storage = 'Storage',
  BatteryBank = 'BatteryBank',
  Spaceport = 'Spaceport',
  RocketAssembly = 'RocketAssembly',
  SpaceStation = 'SpaceStation',
  OrbitalRefinery = 'OrbitalRefinery',
  LunarMine = 'LunarMine',
  DeepSpaceProbe = 'DeepSpaceProbe',
  SpaceHabitat = 'SpaceHabitat',
  Excavator = 'Excavator',
  Dredger = 'Dredger',
  Terraformer = 'Terraformer',
  PlanetaryEngine = 'PlanetaryEngine',
}

export enum FacilityStatus {
  Planning = 'Planning',
  UnderConstruction = 'UnderConstruction',
  Active = 'Active',
  Idle = 'Idle',
  Damaged = 'Damaged',
  Destroyed = 'Destroyed',
}

export interface FacilitySummary {
  id: number
  type: FacilityType
  name: string
  lat: number
  lon: number
  status: FacilityStatus
  techRequired: string | null
  activeRecipeId: string | null
  powerConnected: boolean
  throughput: number
  footprint: Array<{ lat: number; lon: number }> | null
}

export interface FacilityDetail {
  id: number
  type: FacilityType
  name: string
  lat: number
  lon: number
  status: FacilityStatus
  techRequired: string | null
  activeRecipeId: string | null
  targetOutputRate: number
  inputs: FacilityBufferEntry[]
  outputs: FacilityBufferEntry[]
  powerConsumption: number
  powerConnected: boolean
  elevation: number
  terrainClass: string
  constructionProgress: number
  throughput: number
  footprint: Array<{ lat: number; lon: number }> | null
}

export interface FacilityBufferEntry {
  resourceKey: string
  quantity: number
  capacity: number
  unit: string
}