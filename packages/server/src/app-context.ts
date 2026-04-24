import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { UnitOfWork } from '@fulfil/framework';

import {
  createAggregateRegistry,
  type AggregateRegistry,
} from './infrastructure/aggregate-registry.js';
import {
  createTransactionManager,
  type TransactionManager,
} from './infrastructure/transaction.js';
import { createDrizzleUnitOfWork } from './infrastructure/unit-of-work.js';
import { createDrizzleLastMileFulfilmentRepository } from './infrastructure/last-mile-fulfilment-repository.js';
import { registerLastMileFulfilment } from './infrastructure/register-last-mile-fulfilment.js';
import { LAST_MILE_FULFILMENT_ID_PREFIX } from './domain/lastmile/ids.js';
import { LAST_MILE_FULFILMENT_TYPE } from './domain/lastmile/last-mile-fulfilment.js';
import type { LastMileFulfilmentRepository } from './domain/lastmile/last-mile-fulfilment.repository.js';
import { CreateLastMileFulfilmentUseCase } from './operations/create-last-mile-fulfilment/create-last-mile-fulfilment.use-case.js';

/**
 * Composition root for the server. Wires the repository + UnitOfWork +
 * aggregate-registry graph once, at bootstrap, and exposes use cases that the
 * HTTP layer can consume.
 *
 * Keep this file dumb — no business logic, only wiring. New aggregates and use
 * cases get one line each (register + instantiate).
 */
export interface AppContext {
  readonly db: PostgresJsDatabase;
  readonly transactionManager: TransactionManager;
  readonly aggregateRegistry: AggregateRegistry;
  readonly unitOfWork: UnitOfWork;
  readonly repositories: {
    readonly lastMileFulfilments: LastMileFulfilmentRepository;
  };
  readonly useCases: {
    readonly createLastMileFulfilment: CreateLastMileFulfilmentUseCase;
  };
}

export interface AppContextConfig {
  readonly db: PostgresJsDatabase;
  /** FlowCatalyst client id — used by the outbox driver for message routing. */
  readonly clientId: string;
}

export function createAppContext(config: AppContextConfig): AppContext {
  const { db, clientId } = config;

  const transactionManager = createTransactionManager(db);

  // Prefix map lets plain-object aggregates resolve their handler via id.
  // Each new aggregate adds one entry here.
  const aggregateRegistry = createAggregateRegistry({
    [LAST_MILE_FULFILMENT_ID_PREFIX]: LAST_MILE_FULFILMENT_TYPE,
  });

  const lastMileFulfilmentRepo = createDrizzleLastMileFulfilmentRepository(db);
  registerLastMileFulfilment(aggregateRegistry, lastMileFulfilmentRepo);

  const unitOfWork = createDrizzleUnitOfWork({
    transactionManager,
    aggregateRegistry,
    clientId,
  });

  return {
    db,
    transactionManager,
    aggregateRegistry,
    unitOfWork,
    repositories: {
      lastMileFulfilments: lastMileFulfilmentRepo,
    },
    useCases: {
      createLastMileFulfilment: new CreateLastMileFulfilmentUseCase(
        unitOfWork,
        lastMileFulfilmentRepo,
      ),
    },
  };
}
