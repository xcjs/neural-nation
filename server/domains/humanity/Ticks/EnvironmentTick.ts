import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { eq } from 'drizzle-orm';
import { schema } from '../../../db/schema';

const FACILITY_IMPACT: Record<string, { pollution: number; forest: number; water: number; biodiversity: number }> = {
  CoalPlant: { pollution: 0.1, forest: 0, water: 0, biodiversity: 0 },
  OilPlant: { pollution: 0.07, forest: 0, water: 0, biodiversity: 0 },
  GasPlant: { pollution: 0.04, forest: 0, water: 0, biodiversity: 0 },
  DieselGenerator: { pollution: 0.05, forest: 0, water: 0, biodiversity: 0 },
  BiomassPlant: { pollution: 0.02, forest: -0.01, water: 0, biodiversity: -0.005 },
  BiogasPlant: { pollution: 0.01, forest: 0, water: 0, biodiversity: 0 },
  NuclearReactor: { pollution: 0.002, forest: 0, water: -0.003, biodiversity: 0 },
  BreederReactor: { pollution: 0.002, forest: 0, water: -0.003, biodiversity: 0 },
  FusionReactor: { pollution: 0, forest: 0, water: 0, biodiversity: 0 },
  SolarFarm: { pollution: 0, forest: 0, water: 0, biodiversity: 0 },
  WindFarm: { pollution: 0, forest: 0, water: 0, biodiversity: 0 },
  HydroPlant: { pollution: 0, forest: -0.002, water: -0.002, biodiversity: -0.002 },
  GeothermalPlant: { pollution: 0.005, forest: 0, water: -0.001, biodiversity: 0 },
  EthanolRefinery: { pollution: 0.02, forest: 0, water: -0.002, biodiversity: 0 },
  SoylentPlant: { pollution: 0.005, forest: -0.005, water: -0.003, biodiversity: -0.01 },
  Extractor: { pollution: 0.03, forest: -0.005, water: -0.005, biodiversity: -0.005 },
  Farm: { pollution: 0.015, forest: -0.003, water: -0.003, biodiversity: -0.005 },
  Forestry: { pollution: 0.01, forest: -0.02, water: 0, biodiversity: -0.01 },
  WaterPump: { pollution: 0.005, forest: 0, water: -0.002, biodiversity: 0 },
  Smelter: { pollution: 0.06, forest: 0, water: 0, biodiversity: 0 },
  Refinery: { pollution: 0.07, forest: 0, water: -0.005, biodiversity: 0 },
  Processor: { pollution: 0.04, forest: 0, water: -0.002, biodiversity: 0 },
  ChemicalPlant: { pollution: 0.05, forest: 0, water: -0.005, biodiversity: -0.002 },
  Factory: { pollution: 0.04, forest: 0, water: -0.002, biodiversity: -0.002 },
  AdvancedFactory: { pollution: 0.03, forest: 0, water: -0.001, biodiversity: -0.001 },
  Excavator: { pollution: 0.03, forest: -0.01, water: -0.005, biodiversity: -0.01 },
  Dredger: { pollution: 0.02, forest: 0, water: -0.01, biodiversity: -0.01 },
  Terraformer: { pollution: 0.05, forest: -0.02, water: -0.01, biodiversity: -0.02 },
  PlanetaryEngine: { pollution: 0.1, forest: -0.05, water: -0.05, biodiversity: -0.05 },
};

export class EnvironmentTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(tick: number): void {
    const env = this.db.select().from(schema.environment).where(eq(schema.environment.key, 'global')).get();
    if (!env)
      return;

    const activeFacilities = this.db.select()
      .from(schema.facilities)
      .where(eq(schema.facilities.status, 'Active'))
      .all();

    let pollutionDelta = 0;
    let forestDelta = 0;
    let waterDelta = 0;
    let biodiversityDelta = 0;

    for (const facility of activeFacilities) {
      const impact = FACILITY_IMPACT[facility.type];
      if (!impact)
        continue;

      pollutionDelta += impact.pollution;
      forestDelta += impact.forest;
      waterDelta += impact.water;
      biodiversityDelta += impact.biodiversity;

      if ((facility.type === 'NuclearReactor' || facility.type === 'BreederReactor') && facility.throughput > 0) {
        if (Math.random() < 0.0001) {
          this.logIncident(tick, 'nuclear_incident', `Nuclear incident at ${facility.name} (id=${facility.id})`, 'critical', facility.id);
          pollutionDelta += 5;
          waterDelta -= 2;
          biodiversityDelta -= 1;
        }
      }
    }

    if (env.pollutionLevel < 30) {
      forestDelta += 0.005;
      biodiversityDelta += 0.003;
    }

    if (env.pollutionLevel > 60) {
      forestDelta -= 0.01;
      biodiversityDelta -= 0.005;
    }

    if (env.pollutionLevel > 50) {
      waterDelta -= 0.005;
    }

    const newPollution = Math.max(0, Math.min(100, env.pollutionLevel + pollutionDelta));
    const newForest = Math.max(0, Math.min(100, env.forestCoverage + forestDelta));
    const newWater = Math.max(0, Math.min(100, env.waterQuality + waterDelta));
    const newBiodiversity = Math.max(0, Math.min(100, env.biodiversity + biodiversityDelta));

    this.db.update(schema.environment)
      .set({
        pollutionLevel: newPollution,
        forestCoverage: newForest,
        waterQuality: newWater,
        biodiversity: newBiodiversity,
      })
      .where(eq(schema.environment.key, 'global'))
      .run();

    if (env.forestCoverage > 20 && newForest <= 20) {
      this.logIncident(tick, 'deforestation_collapse', 'Forest coverage has collapsed below 20% — biome degradation accelerating', 'warning');
    }

    if (env.waterQuality > 30 && newWater <= 30) {
      this.logIncident(tick, 'water_contamination', 'Water quality has dropped below 30% — contamination spreading', 'warning');
    }

    if (env.pollutionLevel < 80 && newPollution >= 80) {
      this.logIncident(tick, 'climate_shift', 'Pollution has reached critical levels — climate shift imminent', 'critical');
    }
  }

  private logIncident(tick: number, type: string, message: string, severity: string, facilityId: number | null = null): void {
    this.db.insert(schema.incidents).values({
      type,
      severity,
      description: message,
      tickTriggered: tick,
      tickResolved: null,
    }).run();

    this.db.insert(schema.events).values({
      tick,
      timestamp: new Date().toISOString(),
      type,
      message,
      severity,
      facilityId,
      data: null,
    }).run();
  }
}
