/**
 * SLA Samples Table Schema
 *
 * Stores captured SLA breach samples including slow query data.
 * Created by the SLA tracker via the framework Fastify plugin.
 */

import { pgTable, varchar, integer, jsonb } from 'drizzle-orm/pg-core';
import { rawTsidColumn, timestampColumn } from './common.js';

export const slaSamples = pgTable('sla_samples', {
  id: rawTsidColumn('id').primaryKey(),
  route: varchar('route', { length: 500 }).notNull(),
  durationMs: integer('duration_ms').notNull(),
  thresholdMs: integer('threshold_ms').notNull(),
  excessMs: integer('excess_ms').notNull(),
  queries: jsonb('queries').$type<Record<string, unknown>[]>().notNull(),
  correlationId: varchar('correlation_id', { length: 100 }).notNull(),
  tenantId: varchar('tenant_id', { length: 100 }),
  capturedAt: timestampColumn('captured_at').notNull(),
});

export type NewSlaSample = typeof slaSamples.$inferInsert;
export type SlaSampleRow = typeof slaSamples.$inferSelect;
