export enum PowerType {
  Coal = 'Coal',
  Gas = 'Gas',
  Oil = 'Oil',
  Diesel = 'Diesel',
  Nuclear = 'Nuclear',
  Breeder = 'Breeder',
  Fusion = 'Fusion',
  Solar = 'Solar',
  Wind = 'Wind',
  Hydro = 'Hydro',
  Geothermal = 'Geothermal',
  Biomass = 'Biomass',
  Biogas = 'Biogas',
  Soylent = 'Soylent',
}

export enum GridStatus {
  Normal = 'Normal',
  Brownout = 'Brownout',
  Blackout = 'Blackout',
}

export interface PowerGridSummary {
  totalCapacity: number
  totalGeneration: number
  totalConsumption: number
  gridStatus: GridStatus
  connectedComponents: number
  storage: number
  storageCapacity: number
  lines: PowerLineSummary[]
}

export interface PowerLineSummary {
  id: number
  fromFacilityId: number
  toFacilityId: number
  capacity: number
  load: number
  transmissionLoss: number
}