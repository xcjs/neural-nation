import type { Container } from '../ioc/Container';
import { IDbConnection } from '../db/IDbConnection';
import { Lifecycle } from '../ioc/Lifecycle';
import { Token } from '../ioc/Token';
import { ITerrainRepository } from '../terrain/Repositories/ITerrainRepository';
import { FacilityService } from './FacilityService';
import { FacilityRepository } from './Repositories/FacilityRepository';
import { IFacilityRepository } from './Repositories/IFacilityRepository';

export const IFacilityService = new Token<FacilityService>('IFacilityService');

export function registerFacilitiesModule(container: Container): void {
  container.bind(IFacilityRepository, c => new FacilityRepository(c.resolve(IDbConnection).getDb()), Lifecycle.Scoped);
  container.bind(IFacilityService, c => new FacilityService(
    c.resolve(IFacilityRepository),
    c.resolve(ITerrainRepository),
  ), Lifecycle.Scoped);
}
