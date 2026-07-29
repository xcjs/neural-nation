import { Token } from '../../ioc/Token';

export interface PowerFacilityRow {
  id: number;
  type: string;
  lat: number;
  lon: number;
  targetOutputRate: number;
  powerConsumption: number;
  powerThrottle: number;
}

export interface PowerLineTransportRow {
  id: number;
  fromFacilityId: number;
  toFacilityId: number;
  type: string;
  capacity: number;
}

export interface IPowerRepository {
  getAllFacilities: () => PowerFacilityRow[];
  getAllPowerLineTransports: () => PowerLineTransportRow[];
}

export const IPowerRepository = new Token<IPowerRepository>('IPowerRepository');