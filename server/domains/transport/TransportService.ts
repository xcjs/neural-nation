import type { PaginatedResult, PaginationParams } from '../../../lib/types/mcp';
import type { TransportSummary } from '../../../lib/types/transport';
import type { ITransportRepository, TransportRow } from './Repositories/ITransportRepository';
import { TransportType } from '../../../lib/types/transport';
import { greatCircleDistance } from '../../shared/geo/distance';

export class TransportService {
  constructor(private readonly transportRepo: ITransportRepository) {}

  buildTransport(params: {
    type: TransportType;
    fromFacilityId: number;
    toFacilityId: number;
    resourceKey?: string;
  }): { transportId: number; terrainModifiers: string[] } {
    const fromFacility = this.transportRepo.getFacilityById(params.fromFacilityId);
    const toFacility = this.transportRepo.getFacilityById(params.toFacilityId);

    if (!fromFacility || !toFacility) {
      throw new Error('Source or destination facility not found');
    }

    const distance = greatCircleDistance(
      fromFacility.lat,
      fromFacility.lon,
      toFacility.lat,
      toFacility.lon,
    );

    const terrainModifiers = this.analyzeTerrain(fromFacility.lat, fromFacility.lon, toFacility.lat, toFacility.lon);

    const tick = this.transportRepo.getMetaTickCount();

    const capacity = this.getTransportCapacity(params.type, distance);

    const transport = this.transportRepo.insertTransport({
      type: params.type,
      fromFacilityId: params.fromFacilityId,
      toFacilityId: params.toFacilityId,
      fromLat: fromFacility.lat,
      fromLon: fromFacility.lon,
      toLat: toFacility.lat,
      toLon: toFacility.lon,
      flowRate: 0,
      resourceKey: params.resourceKey || null,
      capacity,
      terrainModifiers: JSON.stringify(terrainModifiers),
      createdAtTick: tick,
    });

    return { transportId: transport.id, terrainModifiers };
  }

  demolishTransport(transportId: number): { success: boolean } {
    this.transportRepo.deleteTransport(transportId);
    return { success: true };
  }

  listTransports(params: PaginationParams = {}): PaginatedResult<TransportSummary> {
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const items = this.transportRepo.getTransports(limit, offset);
    const totalCount = this.transportRepo.countTransports();

    return {
      items: items.map(t => this.mapToSummary(t)),
      totalCount,
      limit,
      offset,
      hasMore: offset + items.length < totalCount,
    };
  }

  assignRoute(transportId: number, resourceKey: string, flowRate: number): { success: boolean } {
    this.transportRepo.updateTransportRoute(transportId, resourceKey, flowRate);
    return { success: true };
  }

  getSupplyChainStatus() {
    const facilities = this.transportRepo.getAllFacilities();
    const transports = this.transportRepo.getAllTransports();

    const nodes = facilities.map(f => ({
      id: f.id,
      type: f.type,
      name: f.name,
      status: f.status,
      throughput: f.throughput,
    }));

    const edges = transports.map(t => ({
      id: t.id,
      from: t.fromFacilityId,
      to: t.toFacilityId,
      resourceKey: t.resourceKey,
      flowRate: t.flowRate,
      capacity: t.capacity,
    }));

    return { nodes, edges };
  }

  private analyzeTerrain(
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
  ): string[] {
    const modifiers: string[] = [];

    const latMin = Math.min(fromLat, toLat);
    const latMax = Math.max(fromLat, toLat);
    const lonMin = Math.min(fromLon, toLon);
    const lonMax = Math.max(fromLon, toLon);

    const terrainCells = this.transportRepo.getTerrainInBoundingBox(latMin, latMax, lonMin, lonMax);

    for (const cell of terrainCells) {
      if (cell.terrainClass === 'Mountain' || cell.terrainClass === 'HighMountain') {
        if (!modifiers.includes('tunnel'))
          modifiers.push('tunnel');
      }
      if (cell.terrainClass === 'Ocean') {
        if (!modifiers.includes('bridge'))
          modifiers.push('bridge');
      }
    }

    return modifiers;
  }

  private getTransportCapacity(type: TransportType, distanceKm: number): number {
    switch (type) {
      case TransportType.Road:
        return Math.max(10, 100 - distanceKm * 0.1);
      case TransportType.Conveyor:
        return 50;
      case TransportType.Pipeline:
        return 200;
      case TransportType.PowerLine:
        return 100;
      default:
        return 50;
    }
  }

  private mapToSummary(t: TransportRow): TransportSummary {
    return {
      id: t.id,
      type: t.type as TransportType,
      fromFacilityId: t.fromFacilityId,
      toFacilityId: t.toFacilityId,
      fromLat: t.fromLat,
      fromLon: t.fromLon,
      toLat: t.toLat,
      toLon: t.toLon,
      resourceKey: t.resourceKey,
      flowRate: t.flowRate,
      capacity: t.capacity,
      terrainModifiers: JSON.parse(t.terrainModifiers || '[]'),
    };
  }
}
