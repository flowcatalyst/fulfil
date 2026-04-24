/**
 * Transaction Management
 *
 * Transaction context and utilities for atomic database operations.
 * Uses postgres.js transactions with DrizzleORM.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export interface TransactionContext {
  readonly db: PostgresJsDatabase;
}

export interface TransactionManager {
  inTransaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
  readonly db: PostgresJsDatabase;
}

export function createTransactionManager(
  db: PostgresJsDatabase,
): TransactionManager {
  return {
    db,
    async inTransaction<T>(
      fn: (tx: TransactionContext) => Promise<T>,
    ): Promise<T> {
      return db.transaction(async (tx) => {
        return fn({ db: tx as unknown as PostgresJsDatabase });
      });
    },
  };
}

export function resolveDb(
  defaultDb: PostgresJsDatabase,
  tx?: TransactionContext,
): PostgresJsDatabase {
  return tx?.db ?? defaultDb;
}
