import { desc, like, or, sql } from 'drizzle-orm';
import { defineEventHandler, getQuery } from 'h3';
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

  const limit = Math.min(Number.parseInt(String(query.limit)) || 25, 200);
  const offset = Math.max(Number.parseInt(String(query.offset)) || 0, 0);
  const search = (query.search as string | undefined)?.trim();

  const scope = createScopedContainer(entry.token);
  const db = scope.resolve(IDbConnection).getDb();

  let queryBuilder = db.select().from(schema.actions).$dynamic();
  const conditions = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(schema.actions.toolName, pattern),
        like(schema.actions.arguments, pattern),
        like(schema.actions.resultStatus, pattern),
      ),
    );
  }
  if (conditions.length > 0) {
    queryBuilder = queryBuilder.where(conditions[0]!);
  }

  const items = queryBuilder
    .orderBy(desc(schema.actions.id))
    .limit(limit)
    .offset(offset)
    .all();

  const countRow = db.select({ count: sql<number>`count(*)` })
    .from(schema.actions)
    .get();
  const totalCount = countRow?.count ?? items.length;

  return { items, totalCount, limit, offset };
});
