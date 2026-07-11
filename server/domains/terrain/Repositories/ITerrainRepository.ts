import type { schema } from '../../../db/schema';
import { Token } from '../../ioc/Token';

export interface ITerrainRepository {
  getTerrainCellNear: (lat: number, lon: number) => typeof schema.terrain.$inferSelect | undefined;
  getTerrainModificationsForCell: (latIndex: number, lonIndex: number) => Array<typeof schema.terrainModifications.$inferSelect>;
  getTerrainInBoundingBox: (latMin: number, latMax: number, lonMin: number, lonMax: number) => Array<typeof schema.terrain.$inferSelect>;
  getMetaTickCount: () => number;
  insertTerrainModification: (values: typeof schema.terrainModifications.$inferInsert) => void;
  getTerrainModifications: (limit: number, offset: number) => Array<typeof schema.terrainModifications.$inferSelect>;
  countTerrainModifications: () => number;
}

export const ITerrainRepository = new Token<ITerrainRepository>('ITerrainRepository');
