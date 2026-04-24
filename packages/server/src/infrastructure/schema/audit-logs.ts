/**
 * Audit Logs Table Schema
 *
 * Tracks operations performed on entities. Created atomically
 * with entity changes and domain events by the UnitOfWork.
 */

import { pgTable, varchar, jsonb } from 'drizzle-orm/pg-core';
import { rawTsidColumn, timestampColumn } from './common.js';

export const auditLogs = pgTable('audit_logs', {
  id: rawTsidColumn('id').primaryKey(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: varchar('entity_id', { length: 100 }).notNull(),
  operation: varchar('operation', { length: 200 }).notNull(),
  operationJson: jsonb('operation_json'),
  principalId: varchar('principal_id', { length: 100 }).notNull(),
  performedAt: timestampColumn('performed_at').notNull(),
});

export type NewAuditLog = typeof auditLogs.$inferInsert;
export type AuditLogRow = typeof auditLogs.$inferSelect;
