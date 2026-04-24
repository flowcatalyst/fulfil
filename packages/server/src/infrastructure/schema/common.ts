/**
 * Common Schema Definitions
 *
 * Shared column definitions and types used across all database tables.
 */

import { varchar, timestamp } from 'drizzle-orm/pg-core';

/**
 * Typed ID column — 17-character prefixed TSID.
 * Format: "{prefix}_{tsid}" (e.g., "ord_0HZXEQ5Y8JY5Z")
 */
export const tsidColumn = (name: string) => varchar(name, { length: 17 });

/**
 * Raw TSID column — 13-character unprefixed TSID.
 * Used for high-volume tables where prefix overhead adds up.
 */
export const rawTsidColumn = (name: string) => varchar(name, { length: 13 });

/**
 * Standard timestamp column with timezone.
 */
export const timestampColumn = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });

export const baseEntityColumns = {
  id: tsidColumn('id').primaryKey(),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
  updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
};

export interface BaseEntity {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type NewEntity<T extends BaseEntity> = Omit<
  T,
  'createdAt' | 'updatedAt'
> & {
  createdAt?: Date;
  updatedAt?: Date;
};
