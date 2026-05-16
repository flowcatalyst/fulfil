/**
 * Drizzle-backed Effect Unit of Work + DispatchJobBroker.
 *
 * One `OutboxManager` is built once at composition root over the ALS-aware
 * `DrizzleOutboxDriver`. Two Effect Tags ride that manager:
 *
 *  - `UnitOfWork` (from the SDK) — aggregate state + domain events. Produces
 *    `Sealed<E>`; the seal is the type-level UoW gate.
 *  - `DispatchJobBroker` (Fulfil-defined) — `outboxManager.createDispatchJob(dto)`,
 *    `createDispatchJobs(dtos)`. Lets reactor / planner use cases emit
 *    cross-aggregate dispatch jobs alongside their aggregate commits.
 *
 * Because both Layers wrap the same `OutboxManager` → same `DrizzleOutboxDriver`
 * → same `TransactionStore`-bound Drizzle tx, a use case can `yield*
 * commitAggregate(...)` and `yield* dispatchJobBroker.emit(...)` in one
 * `Effect.gen` block and both writes commit atomically.
 *
 * Hybrid audit: local `audit_logs` row (strong integrity) + SDK
 * `CreateAuditLogDto` via OutboxManager (`auditEnabled: true`). Both ride
 * the same Drizzle tx.
 */

import { Context, Effect, Layer } from 'effect';
import {
  generateTsid,
  OutboxManager,
  type CreateDispatchJobDto,
} from '@flowcatalyst/sdk';
import {
  DomainEvent as DomainEventNS,
  InfrastructureError,
  OutboxUnitOfWork,
  UnitOfWork,
  type Aggregate,
  type DomainEvent,
  type Sealed,
  type ConcurrencyError,
} from '@fulfil/framework';
import type { AggregateRegistry as AggregateRegistryImpl } from './aggregate-registry.js';
import { DrizzleOutboxDriver } from './outbox-driver.js';
import { TransactionStore } from './transaction-store.js';
import { auditLogs, type NewAuditLog } from './schema/audit-logs.js';
import type { TransactionContext } from './transaction.js';

/** Effect Tag exposing the aggregate-type → repository dispatch registry. */
export class AggregateRegistry extends Context.Service<
  AggregateRegistry,
  AggregateRegistryImpl
>()('@fulfil/AggregateRegistry') {}

/**
 * Effect Tag exposing dispatch-job emission via the same outbox/tx as UoW.
 *
 * Use cases yield this Tag to fire-and-forget cross-aggregate work. The
 * dispatch job rides the outbox table and is delivered to the target URL
 * by FlowCatalyst once the Drizzle tx commits.
 */
export class DispatchJobBroker extends Context.Service<
  DispatchJobBroker,
  {
    readonly emit: (
      job: CreateDispatchJobDto,
    ) => Effect.Effect<string, InfrastructureError>;
    readonly emitMany: (
      jobs: readonly CreateDispatchJobDto[],
    ) => Effect.Effect<readonly string[], InfrastructureError>;
  }
>()('@fulfil/DispatchJobBroker') {}

export interface OutboxManagerConfig {
  /** FlowCatalyst client ID for outbox message routing. */
  readonly clientId: string;
}

/**
 * Build the single `OutboxManager` the rest of the layers share.
 *
 * The driver is ALS-aware and stateless, so this is safe to call once at
 * composition root and reuse across every request.
 */
export const buildOutboxManager = (config: OutboxManagerConfig): OutboxManager =>
  new OutboxManager(new DrizzleOutboxDriver(), config.clientId);

export interface UnitOfWorkLayerOptions {
  /** Emit a SDK audit log per commit. Default: true (Fulfil hybrid audit). */
  readonly auditEnabled?: boolean;
}

/** UnitOfWork Layer backed by the shared `OutboxManager`. */
export const unitOfWorkLayer = (
  manager: OutboxManager,
  options?: UnitOfWorkLayerOptions,
): Layer.Layer<UnitOfWork> =>
  OutboxUnitOfWork.layer(manager, {
    auditEnabled: options?.auditEnabled ?? true,
  });

/** DispatchJobBroker Layer backed by the shared `OutboxManager`. */
export const dispatchJobBrokerLayer = (
  manager: OutboxManager,
): Layer.Layer<DispatchJobBroker> =>
  Layer.succeed(DispatchJobBroker, {
    emit: (job) =>
      Effect.tryPromise({
        try: () => manager.createDispatchJob(job),
        catch: (cause) =>
          new InfrastructureError({
            code: 'DISPATCH_JOB_FAILED',
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
    emitMany: (jobs) =>
      Effect.tryPromise({
        try: () => manager.createDispatchJobs([...jobs]),
        catch: (cause) =>
          new InfrastructureError({
            code: 'DISPATCH_JOBS_FAILED',
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
  });

/** Provide the aggregate registry instance as an Effect service. */
export const aggregateRegistryLayer = (
  registry: AggregateRegistryImpl,
): Layer.Layer<AggregateRegistry> => Layer.succeed(AggregateRegistry, registry);

/**
 * Commit an aggregate change + emit the domain event atomically.
 *
 * Inside the persist callback (which the SDK runs before writing the outbox):
 *  1. `aggregateRegistry.persist(aggregate, tx)` — write the aggregate
 *  2. `writeLocalAuditLog(tx, event, command)` — append the local audit row
 *
 * All writes (aggregate, local audit, outbox event + outbox audit) live in
 * one Drizzle tx because the driver and persist callback both read tx from
 * `TransactionStore`.
 */
export const commitAggregate = <E extends DomainEvent>(
  aggregate: Aggregate,
  event: E,
  command: unknown,
): Effect.Effect<
  Sealed<E>,
  ConcurrencyError | InfrastructureError,
  UnitOfWork | AggregateRegistry
> =>
  Effect.gen(function* () {
    const uow = yield* UnitOfWork;
    const registry = yield* AggregateRegistry;
    return yield* uow.commit(event, command, async () => {
      const tx = TransactionStore.require();
      await registry.persist(aggregate as never, tx);
      await writeLocalAuditLog(tx, event, command);
    });
  });

/** Commit a deletion — same semantics as `commitAggregate`, signals intent. */
export const commitDelete = <E extends DomainEvent>(
  aggregate: Aggregate,
  event: E,
  command: unknown,
): Effect.Effect<
  Sealed<E>,
  ConcurrencyError | InfrastructureError,
  UnitOfWork | AggregateRegistry
> =>
  Effect.gen(function* () {
    const uow = yield* UnitOfWork;
    const registry = yield* AggregateRegistry;
    return yield* uow.commitDelete(aggregate, event, command, async () => {
      const tx = TransactionStore.require();
      await registry.delete(aggregate as never, tx);
      await writeLocalAuditLog(tx, event, command);
    });
  });

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
