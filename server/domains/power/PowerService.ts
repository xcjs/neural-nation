import type { PowerGridSummary, PowerLineSummary } from './Models/PowerModels';
import type { IPowerRepository } from './Repositories/IPowerRepository';
import { GridStatus } from '../../../lib/types/power';
import { greatCircleDistance, transmissionLossPercent } from '../../shared/geo/distance';
import { POWER_GENERATING_TYPES } from '../shared/constants/facilityTypes';
import { computeConnectedComponents } from './gridTopology';

export class PowerService {
  constructor(private readonly powerRepo: IPowerRepository) {}

  getPowerGridStatus(): PowerGridSummary {
    const facilities = this.powerRepo.getAllFacilities();
    const powerLineTransports = this.powerRepo.getAllPowerLineTransports();

    const generators = facilities.filter(f => POWER_GENERATING_TYPES.has(f.type));
    const consumers = facilities.filter(f => f.powerConsumption > 0);

    const totalCapacity = generators.reduce((sum, g) => sum + (g.targetOutputRate || 0), 0);
    const totalDemand = consumers.reduce((sum, c) => sum + c.powerConsumption, 0);

    let status = GridStatus.Normal;
    if (totalDemand > totalCapacity * 0.9)
      status = GridStatus.Brownout;
    if (totalDemand > totalCapacity)
      status = GridStatus.Blackout;

    const lines: PowerLineSummary[] = powerLineTransports.map((line) => {
      const from = facilities.find(f => f.id === line.fromFacilityId);
      const to = facilities.find(f => f.id === line.toFacilityId);

      let loss = 0;
      if (from && to) {
        const dist = greatCircleDistance(from.lat, from.lon, to.lat, to.lon);
        loss = transmissionLossPercent(dist);
      }

      return {
        id: line.id,
        fromFacilityId: line.fromFacilityId,
        toFacilityId: line.toFacilityId,
        capacity: line.capacity,
        load: 0,
        transmissionLoss: loss,
      };
    });

    const connectedComponents = computeConnectedComponents(
      facilities.map(f => f.id),
      powerLineTransports.map(t => ({ fromFacilityId: t.fromFacilityId, toFacilityId: t.toFacilityId })),
    );

    return {
      totalCapacity,
      totalDemand,
      status,
      lines,
      connectedGrids: connectedComponents,
    };
  }
}