import { AsyncLocalStorage } from 'node:async_hooks';
import type { TransactionContext } from './transaction.js';

const storage = new AsyncLocalStorage<TransactionContext>();

/**
 * AsyncLocalStorage holding the current Drizzle transaction.
 *
 * Bound by the route boundary via `TransactionStore.run(tx, fn)` from inside
 * `transactionManager.inTransaction(...)`. The `DrizzleOutboxDriver`,
 * aggregate persistence callbacks, and local audit-log writes all read the
 * tx from this store, so they participate in the same atomic write as the
 * outbox insert produced by the SDK's `OutboxUnitOfWork.layer`.
 *
 * Propagation: ALS rides through `await` boundaries and microtask scheduling,
 * which is what Effect uses for fiber yields. As long as the program is
 * `Effect.runPromise`'d from inside `TransactionStore.run`, every async
 * continuation sees the same tx.
 */
export const TransactionStore = {
  get(): TransactionContext | undefined {
    return storage.getStore();
  },
  require(): TransactionContext {
    const tx = storage.getStore();
    if (!tx) {
      throw new Error(
        'No active transaction. Use-case writes must be dispatched through ' +
          'AppContext.runWrite(...) which opens a tx and binds it on ALS.',
      );
    }
    return tx;
  },
  run<T>(tx: TransactionContext, fn: () => T): T {
    return storage.run(tx, fn);
  },
} as const;
