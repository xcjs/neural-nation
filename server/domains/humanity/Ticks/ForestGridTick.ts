import type Database from 'better-sqlite3';
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

const FOREST_DEPLETION_RADIUS_DEG = 2;
const FOREST_REGEN_RATE = 0.001;

export class ForestGridTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(_tick: number): void {
    const rawDb = (this.db as unknown as { session: { client: Database.Database } }).session.client;

    const countRow = rawDb.prepare('SELECT COUNT(*) as n FROM forest_grid').get() as { n: number };
    if (countRow.n === 0)
      return;

    const activeFacilities = this.db.select()
      .from(schema.facilities)
      .where(eq(schema.facilities.status, 'Active'))
      .all();

    const facilitiesWithForestImpact = activeFacilities.filter((f) => {
      const impact = FACILITY_IMPACT[f.type];
      return impact && impact.forest < 0;
    });

    const radiusDeg = FOREST_DEPLETION_RADIUS_DEG;
    const radiusCells = Math.ceil(radiusDeg / 0.5);

    for (const facility of facilitiesWithForestImpact) {
      const impact = FACILITY_IMPACT[facility.type]!;
      const facLatIdx = Math.floor(((90 - facility.lat) / 180) * 360);
      const facLonIdx = Math.floor(((facility.lon + 180) / 360) * 720);

      const cells = rawDb.prepare(
        `SELECT id, lat_index, lon_index, density FROM forest_grid
         WHERE lat_index BETWEEN ? AND ? AND lon_index BETWEEN ? AND ?`,
      ).all(
        facLatIdx - radiusCells,
        facLatIdx + radiusCells,
        facLonIdx - radiusCells,
        facLonIdx + radiusCells,
      ) as Array<{ id: number; lat_index: number; lon_index: number; density: number }>;

      const updateStmt = rawDb.prepare('UPDATE forest_grid SET density = ? WHERE id = ?');
      for (const cell of cells) {
        const cellLat = 90 - (cell.lat_index / 360) * 180;
        const cellLon = (cell.lon_index / 720) * 360 - 180;
        const dLat = Math.abs(cellLat - facility.lat);
        const dLon = Math.abs(cellLon - facility.lon);
        const dist = Math.sqrt(dLat * dLat + dLon * dLon);
        if (dist <= radiusDeg) {
          const falloff = 1 - (dist / radiusDeg);
          const depletion = Math.abs(impact.forest) * falloff * 0.01;
          const newDensity = Math.max(0, cell.density - depletion);
          updateStmt.run(newDensity, cell.id);
        }
      }
    }

    rawDb.prepare(
      `UPDATE forest_grid SET density = MIN(max_density, density + ?)
       WHERE density < max_density`,
    ).run(FOREST_REGEN_RATE);

    // Normalize against AVG(max_density): pristine state (density == max_density
    // for all cells) maps to 100%, and depletion drops it proportionally.
    // Raw AVG(density) would give ~45% on tick 1 because climate-based max
    // densities range from 0.15 (tundra) to 1.0 (tropical), not 1.0 everywhere.
    const ratioRow = rawDb.prepare(
      'SELECT AVG(density) as avgDensity, AVG(max_density) as avgMax FROM forest_grid',
    ).get() as { avgDensity: number | null; avgMax: number | null };
    const avgDensity = ratioRow.avgDensity ?? 0;
    const avgMax = ratioRow.avgMax ?? 0;
    const forestPct = avgMax > 0
      ? Math.max(0, Math.min(100, (avgDensity / avgMax) * 100))
      : Math.max(0, Math.min(100, avgDensity * 100));
    this.db.update(schema.environment)
      .set({ forestCoverage: forestPct })
      .where(eq(schema.environment.key, 'global'))
      .run();
  }
}
