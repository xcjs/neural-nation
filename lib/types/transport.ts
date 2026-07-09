export enum TransportType {
  Road = 'Road',
  Conveyor = 'Conveyor',
  Pipeline = 'Pipeline',
  PowerLine = 'PowerLine',
  Tunnel = 'Tunnel',
  Bridge = 'Bridge',
  PumpingStation = 'PumpingStation',
  TransmissionTower = 'TransmissionTower',
  SubseaPipeline = 'SubseaPipeline',
}

export interface TransportSummary {
  id: number
  type: TransportType
  fromFacilityId: number
  toFacilityId: number
  fromLat: number
  fromLon: number
  toLat: number
  toLon: number
  flowRate: number
  resourceKey: string | null
  capacity: number
  terrainModifiers: string[]
}

export interface RouteAssignment {
  transportId: number
  resourceKey: string
  flowRate: number
}