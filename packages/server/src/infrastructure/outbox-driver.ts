import type { OutboxDriver, OutboxMessage } from '@flowcatalyst/sdk';
import { sql } from 'drizzle-orm';
import { TransactionStore } from './transaction-store.js';

/**
 * Drizzle-backed OutboxDriver that participates in the current transaction.
 *
 * Reads the active tx from `TransactionStore` (AsyncLocalStorage). Must be
 * invoked inside `AppContext.runWrite(...)` (or any `TransactionStore.run`
 * wrapper) — otherwise `TransactionStore.require()` throws.
 *
 * Stateless and reusable: one instance is built once at composition root,
 * baked into the `OutboxManager` that backs the Effect `UnitOfWork` layer.
 */
export class DrizzleOutboxDriver implements OutboxDriver {
  async insert(message: OutboxMessage): Promise<void> {
    const tx = TransactionStore.require();
    await tx.db.execute(
      sql`INSERT INTO outbox_messages (id, type, message_group, payload, payload_size, status, created_at, updated_at, client_id, headers)
          VALUES (${message.id}, ${message.type}, ${message.message_group}, ${message.payload}, ${message.payload_size}, ${message.status}, ${message.created_at}, ${message.updated_at}, ${message.client_id}, ${message.headers ? JSON.stringify(message.headers) : null})`,
    );
  }

  async insertBatch(messages: OutboxMessage[]): Promise<void> {
    for (const message of messages) {
      await this.insert(message);
    }
  }
}
