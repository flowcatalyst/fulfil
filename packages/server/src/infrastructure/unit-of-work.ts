/**
 * Drizzle Transactional Unit of Work
 *
 * Wraps @flowcatalyst/sdk's OutboxUnitOfWork with a Drizzle transaction so
 * aggregate persistence, outbox event write, SDK audit log, and local
 * audit_logs row all commit atomically.
 *
 * Hybrid audit: a local row is inserted into audit_logs (strong integrity,
 * queryable locally) AND the SDK emits a CreateAuditLogDto via OutboxManager
 * so the platform has a cross-system view.
 */

import { generateTsid, usecase } from '@flowcatalyst/sdk';
import {
  type UnitOfWork,
  type Aggregate,
  type DomainEvent,
  Result,
  UseCaseError,
  DomainEvent as DomainEventNS,
} from '@fulfil/framework';
import { DrizzleOutboxDriver } from './outbox-driver.js';
import type { AggregateRegistry } from './aggregate-registry.js';
import type { TransactionManager, TransactionContext } from './transaction.js';
import { auditLogs, type NewAuditLog } from './schema/audit-logs.js';

export interface DrizzleUnitOfWorkConfig {
  readonly transactionManager: TransactionManager;
  readonly aggregateRegistry: AggregateRegistry;
  /** FlowCatalyst client ID for outbox message routing. */
  readonly clientId: string;
}

export function createDrizzleUnitOfWork(
  config: DrizzleUnitOfWorkConfig,
): UnitOfWork {
  const { transactionManager, aggregateRegistry, clientId } = config;

  async function run<T extends DomainEvent>(
    event: T,
    command: unknown,
    persist: ((tx: TransactionContext) => Promise<void>) | undefined,
  ): Promise<Result<T>> {
    try {
      return await transactionManager.inTransaction(async (tx) => {
        const driver = new DrizzleOutboxDriver(tx.db);
        const sdkUow = usecase.OutboxUnitOfWork.fromDriver(driver, clientId, {
          auditEnabled: true,
        });

        return sdkUow.commit(event, command, async () => {
          if (persist) await persist(tx);
          await writeLocalAuditLog(tx, event, command);
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Result.failure(
        UseCaseError.infrastructure('COMMIT_FAILED', msg, { cause: msg }),
      );
    }
  }

  return {
    async commit<T extends DomainEvent>(
      event: T,
      command: unknown,
      persist?: () => Promise<void>,
    ): Promise<Result<T>> {
      return run(event, command, persist ? async () => { await persist(); } : undefined);
    },

    async commitAggregate<T extends DomainEvent>(
      aggregate: Aggregate,
      event: T,
      command: unknown,
      persist?: () => Promise<void>,
    ): Promise<Result<T>> {
      return run(event, command, async (tx) => {
        await aggregateRegistry.persist(aggregate as never, tx);
        if (persist) await persist();
      });
    },

    async commitDelete<T extends DomainEvent>(
      aggregate: Aggregate,
      event: T,
      command: unknown,
      persist?: () => Promise<void>,
    ): Promise<Result<T>> {
      return run(event, command, async (tx) => {
        await aggregateRegistry.delete(aggregate as never, tx);
        if (persist) await persist();
      });
    },

    async emitEvent<T extends DomainEvent>(
      event: T,
      command: unknown,
    ): Promise<Result<T>> {
      return run(event, command, undefined);
    },
  };
}

async function writeLocalAuditLog(
  tx: TransactionContext,
  event: DomainEvent,
  command: unknown,
): Promise<void> {
  const entityType = DomainEventNS.extractAggregateType(event.subject);
  const entityId = DomainEventNS.extractEntityId(event.subject);

  const row: NewAuditLog = {
    id: generateTsid(),
    entityType,
    entityId: entityId ?? 'unknown',
    operation: event.eventType,
    operationJson:
      command !== null && command !== undefined
        ? JSON.parse(JSON.stringify(command))
        : null,
    principalId: event.principalId,
    performedAt: event.time,
  };

  await tx.db.insert(auditLogs).values(row);
}

/**
 * No-op UnitOfWork for testing — returns success without persisting.
 * Uses the SDK OutboxUnitOfWork backed by an in-memory driver.
 */
export function createNoOpUnitOfWork(): UnitOfWork {
  const driver = {
    async insert(): Promise<void> {},
    async insertBatch(): Promise<void> {},
  };
  return usecase.OutboxUnitOfWork.fromDriver(driver, 'test-client');
}
