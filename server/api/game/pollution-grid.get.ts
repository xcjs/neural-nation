import { gte } from 'drizzle-orm';
import { defineEventHandler, getQuery, setHeader } from 'h3';
import { schema } from '../../db/schema';
import { IDbConnection } from '../../domains/db/IDbConnection';
import { findRegistryEntry, findRegistryEntryByPublicToken } from '../../domains/game/GameRegistry';
import { createScopedContainer } from '../../utils/container';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = query.token as string | undefined;

  if (!token) {
    return { status: 401, error: 'Missing token' };
  }

  const entry = findRegistryEntry(token) || findRegistryEntryByPublicToken(token);
  if (!entry) {
    return { status: 404, error: 'Game not found' };
  }

  const scope = createScopedContainer(entry.token);
  const db = scope.resolve(IDbConnection).getDb();

  const minPollution = query.minPollution ? Number.parseFloat(query.minPollution as string) : 0;
  let cells;
  if (minPollution > 0) {
    cells = db.select()
      .from(schema.pollutionGrid)
      .where(gte(schema.pollutionGrid.pollution, minPollution))
      .all();
  }
  else {
    cells = db.select().from(schema.pollutionGrid).all();
  }

  const compact = cells.map(c => [c.latIndex, c.lonIndex, c.pollution]);

  setHeader(event, 'content-type', 'application/json');
  return { cells: compact };
});
