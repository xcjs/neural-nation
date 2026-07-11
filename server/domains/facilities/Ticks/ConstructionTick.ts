import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { eq } from 'drizzle-orm';
import { schema } from '../../../db/schema';

const CONSTRUCTION_TIMES: Record<string, number> = {
  Extractor: 2,
  Farm: 2,
  Forestry: 2,
  WaterPump: 2,
  Processor: 3,
  Smelter: 3,
  Refinery: 3,
  Factory: 4,
  AdvancedFactory: 5,
  ChemicalPlant: 4,
  ResearchLab: 4,
  PowerPlant: 3,
  SolarFarm: 2,
  WindFarm: 2,
  HydroPlant: 5,
  NuclearReactor: 8,
  BreederReactor: 10,
  FusionReactor: 15,
  BiomassPlant: 3,
  BiogasPlant: 3,
  EthanolRefinery: 4,
  SoylentPlant: 4,
  DieselGenerator: 2,
  CoalPlant: 3,
  GasPlant: 3,
  OilPlant: 3,
  GeothermalPlant: 5,
  Storage: 2,
  BatteryBank: 3,
  Spaceport: 10,
  RocketAssembly: 8,
  SpaceStation: 15,
  OrbitalRefinery: 12,
  LunarMine: 12,
  DeepSpaceProbe: 15,
  SpaceHabitat: 20,
  Excavator: 4,
  Dredger: 4,
  Terraformer: 10,
  PlanetaryEngine: 20,
};

const DEFAULT_CONSTRUCTION_TIME = 3;

export class ConstructionTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(_tick: number): void {
    const underConstruction = this.db.select()
      .from(schema.facilities)
      .where(eq(schema.facilities.status, 'UnderConstruction'))
      .all();

    for (const facility of underConstruction) {
      const totalTime = CONSTRUCTION_TIMES[facility.type] ?? DEFAULT_CONSTRUCTION_TIME;
      const newProgress = facility.constructionProgress + 1;

      if (newProgress >= totalTime) {
        this.db.update(schema.facilities)
          .set({ constructionProgress: totalTime, status: 'Active' })
          .where(eq(schema.facilities.id, facility.id))
          .run();
      }
      else {
        this.db.update(schema.facilities)
          .set({ constructionProgress: newProgress })
          .where(eq(schema.facilities.id, facility.id))
          .run();
      }
    }
  }
}
