import type Database from 'better-sqlite3';
import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { eq } from 'drizzle-orm';
import { schema } from '../../../db/schema';

const FACILITY_POLLUTION: Record<string, number> = {
  CoalPlant: 0.1,
  OilPlant: 0.07,
  GasPlant: 0.04,
  DieselGenerator: 0.05,
  BiomassPlant: 0.02,
  BiogasPlant: 0.01,
  NuclearReactor: 0.002,
  BreederReactor: 0.002,
  FusionReactor: 0,
  SolarFarm: 0,
  WindFarm: 0,
  HydroPlant: 0,
  GeothermalPlant: 0.005,
  EthanolRefinery: 0.02,
  SoylentPlant: 0.005,
  Extractor: 0.03,
  Farm: 0.015,
  Forestry: 0.01,
  WaterPump: 0.005,
  Smelter: 0.06,
  Refinery: 0.07,
  Processor: 0.04,
  ChemicalPlant: 0.05,
  Factory: 0.04,
  AdvancedFactory: 0.03,
  Excavator: 0.03,
  Dredger: 0.02,
  Terraformer: 0.05,
  PlanetaryEngine: 0.1,
};

const POLLUTION_RADIUS_DEG = 3;
const POLLUTION_DISSIPATION_RATE = 0.002;

export class PollutionGridTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(_tick: number): void {
    const rawDb = (this.db as unknown as { session: { client: Database.Database } }).session.client;

    const countRow = rawDb.prepare('SELECT COUNT(*) as n FROM pollution_grid').get() as { n: number };
    if (countRow.n === 0)
      return;

    const activeFacilities = this.db.select()
      .from(schema.facilities)
      .where(eq(schema.facilities.status, 'Active'))
      .all();

    const facilitiesWithPollution = activeFacilities.filter((f) => {
      const pollution = FACILITY_POLLUTION[f.type];
      return pollution && pollution > 0;
    });

    const radiusDeg = POLLUTION_RADIUS_DEG;
    const radiusCells = Math.ceil(radiusDeg / 0.5);

    for (const facility of facilitiesWithPollution) {
      const pollutionRate = FACILITY_POLLUTION[facility.type]!;
      const facLatIdx = Math.floor(((90 - facility.lat) / 180) * 360);
      const facLonIdx = Math.floor(((facility.lon + 180) / 360) * 720);

      const cells = rawDb.prepare(
        `SELECT id, lat_index, lon_index, pollution FROM pollution_grid
         WHERE lat_index BETWEEN ? AND ? AND lon_index BETWEEN ? AND ?`,
      ).all(
        facLatIdx - radiusCells,
        facLatIdx + radiusCells,
        facLonIdx - radiusCells,
        facLonIdx + radiusCells,
      ) as Array<{ id: number; lat_index: number; lon_index: number; pollution: number }>;

      const updateStmt = rawDb.prepare('UPDATE pollution_grid SET pollution = ? WHERE id = ?');
      for (const cell of cells) {
        const cellLat = 90 - (cell.lat_index / 360) * 180;
        const cellLon = (cell.lon_index / 720) * 360 - 180;
        const dLat = Math.abs(cellLat - facility.lat);
        const dLon = Math.abs(cellLon - facility.lon);
        const dist = Math.sqrt(dLat * dLat + dLon * dLon);
        if (dist <= radiusDeg) {
          const falloff = 1 - (dist / radiusDeg);
          const increment = pollutionRate * falloff * 0.5;
          const newPollution = Math.min(100, cell.pollution + increment);
          updateStmt.run(newPollution, cell.id);
        }
      }
    }

    // Dissipation: all cells decay slightly toward 0
    rawDb.prepare(
      `UPDATE pollution_grid SET pollution = MAX(0, pollution - ?)`,
    ).run(POLLUTION_DISSIPATION_RATE);

    // Roll up global average for the environment table
    const avgRow = rawDb.prepare(
      'SELECT AVG(pollution) as avgPollution FROM pollution_grid',
    ).get() as { avgPollution: number | null };
    const avgPollution = avgRow.avgPollution ?? 0;
    const globalPollution = Math.max(0, Math.min(100, avgPollution));
    this.db.update(schema.environment)
      .set({ pollutionLevel: globalPollution })
      .where(eq(schema.environment.key, 'global'))
      .run();
  }
}
