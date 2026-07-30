import { GridStatus } from '../../../lib/types/power';
import { transmissionLossPercent } from '../../shared/geo/distance';

export function solarOutputFactor(lat: number): number {
  return 0.5 * Math.max(0.1, Math.cos((lat * Math.PI) / 180));
}

export function footprintAreaDeg2(footprint: Array<{ lat: number; lon: number }>): number {
  if (footprint.length < 3)
    return 0;
  let sum = 0;
  for (let i = 0; i < footprint.length; i++) {
    const j = (i + 1) % footprint.length;
    sum += footprint[i]!.lon * footprint[j]!.lat;
    sum -= footprint[j]!.lon * footprint[i]!.lat;
  }
  return Math.abs(sum / 2);
}

export function computeConnectedComponents(
  facilityIds: number[],
  edges: Array<{ fromFacilityId: number; toFacilityId: number }>,
): number[][] {
  const adj = new Map<number, Set<number>>();
  for (const id of facilityIds) {
    adj.set(id, new Set());
  }
  for (const edge of edges) {
    adj.get(edge.fromFacilityId)?.add(edge.toFacilityId);
    adj.get(edge.toFacilityId)?.add(edge.fromFacilityId);
  }

  const visited = new Set<number>();
  const components: number[][] = [];

  for (const id of facilityIds) {
    if (visited.has(id))
      continue;
    const component: number[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current))
        continue;
      visited.add(current);
      component.push(current);
      for (const neighbor of adj.get(current) || new Set()) {
        if (!visited.has(neighbor))
          queue.push(neighbor);
      }
    }
    components.push(component);
  }

  return components;
}

export function computeGridThrottle(
  totalCapacity: number,
  totalDemand: number,
): { throttle: number; status: GridStatus } {
  if (totalDemand <= totalCapacity * 0.9) {
    return { throttle: 1.0, status: GridStatus.Normal };
  }
  if (totalDemand <= totalCapacity) {
    return { throttle: 1.0, status: GridStatus.Brownout };
  }
  return { throttle: totalCapacity / totalDemand, status: GridStatus.Blackout };
}

export function applyTransmissionLoss(
  totalCapacity: number,
  avgEdgeDistanceKm: number,
  maxHops: number,
): number {
  if (avgEdgeDistanceKm <= 0 || maxHops <= 0)
    return totalCapacity;
  const lossDistance = avgEdgeDistanceKm * maxHops;
  const lossPercent = transmissionLossPercent(lossDistance);
  return totalCapacity * (1 - Math.min(0.5, lossPercent));
}
