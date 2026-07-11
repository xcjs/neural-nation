import { Token } from '../../ioc/Token';

export interface PowerFacilityRow {
  id: number;
  type: string;
  lat: number;
  lon: number;
  targetOutputRate: number;
  powerConsumption: number;
}

export interface PowerLineRow {
  id: number;
  fromFacilityId: number;
  toFacilityId: number;
  capacity: number;
  load: number;
  transmissionLoss: number;
}

export interface IPowerRepository {
  getAllFacilities: () => PowerFacilityRow[];
  getAllPowerLines: () => PowerLineRow[];
}

export const IPowerRepository = new Token<IPowerRepository>('IPowerRepository');
