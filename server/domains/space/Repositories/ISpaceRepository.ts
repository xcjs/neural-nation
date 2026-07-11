import type { schema } from '../../../db/schema';
import { Token } from '../../ioc/Token';

export interface ISpaceRepository {
  getAllSpaceFacilities: () => Array<typeof schema.spaceFacilities.$inferSelect>;
  getAllSpaceMissions: () => Array<typeof schema.spaceMissions.$inferSelect>;
  getMetaTickCount: () => number;
  insertSpaceMission: (
    values: typeof schema.spaceMissions.$inferInsert,
  ) => typeof schema.spaceMissions.$inferSelect;
  updateSpaceFacilityCrew: (facilityId: number, crewCount: number) => void;
  getHumanity: () => typeof schema.humanity.$inferSelect | undefined;
  updateHumanityAssignedToSpace: (count: number) => void;
}

export const ISpaceRepository = new Token<ISpaceRepository>('ISpaceRepository');
