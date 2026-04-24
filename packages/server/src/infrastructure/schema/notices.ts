/**
 * Notices Table Schema
 *
 * Stores captured notices for observability and debugging.
 * Created by the NoticeService.
 */

import { pgTable, varchar, boolean, jsonb } from 'drizzle-orm/pg-core';
import { rawTsidColumn, timestampColumn } from './common.js';

export const notices = pgTable('notices', {
  id: rawTsidColumn('id').primaryKey(),
  message: varchar('message', { length: 1000 }).notNull(),
  level: varchar('level', { length: 10 }).notNull(),
  code: varchar('code', { length: 200 }).notNull(),
  aggregateType: varchar('aggregate_type', { length: 100 }),
  aggregateId: varchar('aggregate_id', { length: 100 }),
  metadata: jsonb('metadata'),
  correlationId: varchar('correlation_id', { length: 100 }).notNull(),
  principalId: varchar('principal_id', { length: 100 }).notNull(),
  tenantId: varchar('tenant_id', { length: 100 }),
  emitEvent: boolean('emit_event').notNull().default(false),
  capturedAt: timestampColumn('captured_at').notNull(),
});

export type NewNotice = typeof notices.$inferInsert;
export type NoticeRow = typeof notices.$inferSelect;
