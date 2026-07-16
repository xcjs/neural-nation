import type { schema } from '../../../db/schema';
import { Token } from '../../ioc/Token';

export interface ITerrainRepository {
  getTerrainCellNear: (lat: number, lon: number) => typeof schema.terrain.$inferSelect | undefined;
  getTerrainCellByIndex: (latIndex: number, lonIndex: number) => typeof schema.terrain.$inferSelect | undefined;
  getTerrainModificationsForCell: (latIndex: number, lonIndex: number) => Array<typeof schema.terrainModifications.$inferSelect>;
  getTerrainInBoundingBox: (latMin: number, latMax: number, lonMin: number, lonMax: number) => Array<typeof schema.terrain.$inferSelect>;
  getMetaTickCount: () => number;
  insertTerrainModification: (values: typeof schema.terrainModifications.$inferInsert) => void;
  getTerrainModifications: (limit: number, offset: number) => Array<typeof schema.terrainModifications.$inferSelect>;
  countTerrainModifications: () => number;
  getStockpile: (resourceKey: string) => typeof schema.stockpiles.$inferSelect | undefined;
  decrementStockpile: (stockpileId: number, quantity: number) => void;
}

export const ITerrainRepository = new Token<ITerrainRepository>('ITerrainRepository');
