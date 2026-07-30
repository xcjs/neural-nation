export const EXTRACTOR_TYPES = new Set([
  'Extractor',
  'Farm',
  'Forestry',
  'WaterPump',
  'Excavator',
  'Dredger',
]);

export const POWER_GENERATING_TYPES = new Set([
  'PowerPlant',
  'SolarFarm',
  'WindFarm',
  'HydroPlant',
  'NuclearReactor',
  'BreederReactor',
  'FusionReactor',
  'BiomassPlant',
  'BiogasPlant',
  'DieselGenerator',
  'CoalPlant',
  'GasPlant',
  'OilPlant',
  'GeothermalPlant',
]);

export const BASE_POWER_CONSUMPTION: Record<string, number> = {
  Extractor: 0,
  Farm: 0,
  Forestry: 0,
  WaterPump: 0,
  Excavator: 0,
  Dredger: 0,
  Smelter: 5,
  Refinery: 5,
  Processor: 3,
  Factory: 10,
  AdvancedFactory: 15,
  ChemicalPlant: 8,
  Storage: 0,
  ResearchLab: 2,
  TerraformingFacility: 20,
  Spaceport: 50,
};
