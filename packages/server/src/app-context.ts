import { Effect, Layer, ManagedRuntime, Result } from 'effect';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  type Scope,
  type UseCaseError,
  type UnitOfWork,
} from '@fulfil/framework';

import {
  createAggregateRegistry,
  type AggregateRegistry as AggregateRegistryImpl,
} from './infrastructure/aggregate-registry.js';
import {
  createTransactionManager,
  type TransactionManager,
} from './infrastructure/transaction.js';
import { TransactionStore } from './infrastructure/transaction-store.js';
import {
  AggregateRegistry,
  aggregateRegistryLayer,
  buildOutboxManager,
  DispatchJobBroker,
  dispatchJobBrokerLayer,
  unitOfWorkLayer,
} from './infrastructure/unit-of-work.js';
import { createDrizzleLastMileFulfilmentRepository } from './infrastructure/last-mile-fulfilment-repository.js';
import { createDrizzleLastMileShipmentRepository } from './infrastructure/last-mile-shipment-repository.js';
import { registerLastMileFulfilment } from './infrastructure/register-last-mile-fulfilment.js';
import { registerLastMileShipment } from './infrastructure/register-last-mile-shipment.js';
import {
  LAST_MILE_FULFILMENT_ID_PREFIX,
  SHIPMENT_ID_PREFIX,
} from './domain/lastmile/ids.js';
import { LAST_MILE_FULFILMENT_TYPE } from './domain/lastmile/last-mile-fulfilment.js';
import { LAST_MILE_SHIPMENT_TYPE } from './domain/lastmile/last-mile-shipment.js';
import type { LastMileFulfilmentRepository } from './domain/lastmile/last-mile-fulfilment.repository.js';
import type { LastMileShipmentRepository } from './domain/lastmile/last-mile-shipment.repository.js';
import { CreateLastMileFulfilmentUseCase } from './operations/create-last-mile-fulfilment/create-last-mile-fulfilment.use-case.js';
import { CreateLastMileShipmentUseCase } from './operations/create-last-mile-shipment/create-last-mile-shipment.use-case.js';
import { HandleLastMileFulfilmentCreatedUseCase } from './operations/handle-last-mile-fulfilment-created/handle-last-mile-fulfilment-created.use-case.js';

/**
 * Composition root for the server. Wires the repository graph, the
 * `UnitOfWork` / `DispatchJobBroker` / `AggregateRegistry` Layers, and the
 * `runWrite` boundary runner that opens a Drizzle tx, binds it on ALS, and
 * drains the Effect.
 *
 * One `OutboxManager` is built here and shared by both UoW and DispatchJobBroker
 * so events, audit logs, and dispatch jobs all ride the same `TransactionStore`-
 * bound Drizzle tx.
 *
 * Keep this file dumb — no business logic, only wiring.
 */
export interface AppContext {
  readonly db: PostgresJsDatabase;
  readonly transactionManager: TransactionManager;
  readonly aggregateRegistry: AggregateRegistryImpl;
  readonly repositories: {
    readonly lastMileFulfilments: LastMileFulfilmentRepository;
    readonly lastMileShipments: LastMileShipmentRepository;
  };
  readonly useCases: {
    readonly createLastMileFulfilment: CreateLastMileFulfilmentUseCase;
    readonly createLastMileShipment: CreateLastMileShipmentUseCase;
    readonly handleLastMileFulfilmentCreated: HandleLastMileFulfilmentCreatedUseCase;
  };
  /**
   * Run a use-case Effect inside a Drizzle transaction.
   *
   * Provides `UnitOfWork`, `DispatchJobBroker`, and `AggregateRegistry`
   * Layers, collapses the error channel via `Effect.result`, returns the
   * resulting `Result<A, E>` as a Promise.
   *
   * Identity comes from `ScopeStore` (ALS); the program reads it directly
   * via `ScopeStore.require()` rather than through an Effect Tag.
   */
  readonly runWrite: <A>(
    program: Effect.Effect<
      A,
      UseCaseError,
      UnitOfWork | DispatchJobBroker | AggregateRegistry
    >,
    scope: Scope,
  ) => Promise<Result.Result<A, UseCaseError>>;
}

export interface AppContextConfig {
  readonly db: PostgresJsDatabase;
  /** FlowCatalyst client id — used by the outbox driver for message routing. */
  readonly clientId: string;
  /**
   * Public base URL of this Fulfil instance — used by reactors when
   * constructing the `targetUrl` on outbound dispatch jobs.
   */
  readonly publicBaseUrl: string;
  /** Dispatch-pool code used by Fulfil-emitted dispatch jobs. */
  readonly dispatchPoolCode: string;
}

export function createAppContext(config: AppContextConfig): AppContext {
  const { db, clientId, publicBaseUrl, dispatchPoolCode } = config;

  const transactionManager = createTransactionManager(db);

  // Aggregate registry: prefix → type-name map so plain-object aggregates
  // resolve to the correct repository at persist time.
  const aggregateRegistry = createAggregateRegistry({
    [LAST_MILE_FULFILMENT_ID_PREFIX]: LAST_MILE_FULFILMENT_TYPE,
    [SHIPMENT_ID_PREFIX]: LAST_MILE_SHIPMENT_TYPE,
  });

  const lastMileFulfilmentRepo = createDrizzleLastMileFulfilmentRepository(db);
  const lastMileShipmentRepo = createDrizzleLastMileShipmentRepository(db);
  registerLastMileFulfilment(aggregateRegistry, lastMileFulfilmentRepo);
  registerLastMileShipment(aggregateRegistry, lastMileShipmentRepo);

  // One OutboxManager backs both UoW and DispatchJobBroker — see file header.
  const outboxManager = buildOutboxManager({ clientId });

  const baseLayer = Layer.mergeAll(
    unitOfWorkLayer(outboxManager),
    dispatchJobBrokerLayer(outboxManager),
    aggregateRegistryLayer(aggregateRegistry),
  );
  const runtime = ManagedRuntime.make(baseLayer);

  const runWrite = async <A>(
    program: Effect.Effect<
      A,
      UseCaseError,
      UnitOfWork | DispatchJobBroker | AggregateRegistry
    >,
    _scope: Scope,
  ): Promise<Result.Result<A, UseCaseError>> => {
    const collected = Effect.result(program);
    return transactionManager.inTransaction((tx) =>
      TransactionStore.run(tx, () => runtime.runPromise(collected)),
    );
  };

  return {
    db,
    transactionManager,
    aggregateRegistry,
    repositories: {
      lastMileFulfilments: lastMileFulfilmentRepo,
      lastMileShipments: lastMileShipmentRepo,
    },
    useCases: {
      createLastMileFulfilment: new CreateLastMileFulfilmentUseCase(
        lastMileFulfilmentRepo,
      ),
      createLastMileShipment: new CreateLastMileShipmentUseCase(
        lastMileFulfilmentRepo,
      ),
      handleLastMileFulfilmentCreated:
        new HandleLastMileFulfilmentCreatedUseCase(lastMileFulfilmentRepo, {
          publicBaseUrl,
          dispatchPoolCode,
        }),
    },
    runWrite,
  };
}
