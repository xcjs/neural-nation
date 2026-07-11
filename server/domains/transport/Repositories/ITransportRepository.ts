import type { schema } from '../../../db/schema';
import { Token } from '../../ioc/Token';

export type TransportRow = typeof schema.transports.$inferSelect;
export type FacilityRow = typeof schema.facilities.$inferSelect;
export type TerrainRow = typeof schema.terrain.$inferSelect;
export type TransportInsertValues = Omit<typeof schema.transports.$inferInsert, 'id'>;

export interface ITransportRepository {
  getFacilityById: (id: number) => FacilityRow | undefined;
  getTerrainInBoundingBox: (latMin: number, latMax: number, lonMin: number, lonMax: number) => TerrainRow[];
  getMetaTickCount: () => number;
  insertTransport: (values: TransportInsertValues) => TransportRow;
  deleteTransport: (id: number) => void;
  getTransports: (limit: number, offset: number) => TransportRow[];
  countTransports: () => number;
  updateTransportRoute: (id: number, resourceKey: string, flowRate: number) => void;
  getAllFacilities: () => FacilityRow[];
  getAllTransports: () => TransportRow[];
}

export const ITransportRepository = new Token<ITransportRepository>('ITransportRepository');
