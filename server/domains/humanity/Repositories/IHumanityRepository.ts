import type { schema } from '../../../db/schema';
import { Token } from '../../ioc/Token';

export interface IHumanityRepository {
  getHumanity: () => typeof schema.humanity.$inferSelect | undefined;
  getEnvironment: () => typeof schema.environment.$inferSelect | undefined;
  getIncidents: (limit: number, offset: number) => Array<typeof schema.incidents.$inferSelect>;
  countIncidents: () => number;
}

export const IHumanityRepository = new Token<IHumanityRepository>('IHumanityRepository');
