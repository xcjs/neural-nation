import { defineEventHandler, getQuery } from 'h3';
import { IFacilityService } from '../../domains/facilities/FacilitiesModule';
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../../domains/game/GameRegistry';
import { createScopedContainer } from '../../utils/container';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = query.token as string | undefined;
  const facilityId = Number.parseInt(String(query.facilityId));

  if (!token) {
    return { status: 401, error: 'Missing token' };
  }

  const entry = findRegistryEntry(token) || findRegistryEntryByPublicToken(token);
  if (!entry) {
    return { status: 404, error: 'Game not found' };
  }

  if (!facilityId) {
    return { status: 400, error: 'Missing facilityId' };
  }

  const scope = createScopedContainer(entry.token);
  const facilityService = scope.resolve(IFacilityService);
  return facilityService.getFacilityDetails(facilityId);
});
