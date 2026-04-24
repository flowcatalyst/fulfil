import type { OutboxDriver, OutboxMessage } from '@flowcatalyst/sdk';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';

/**
 * Drizzle-backed OutboxDriver that participates in the current transaction.
 *
 * Must be constructed with the active transaction so inserts are atomic
 * with aggregate persistence.
 */
export class DrizzleOutboxDriver implements OutboxDriver {
  constructor(private readonly tx: PostgresJsDatabase) {}

  async insert(message: OutboxMessage): Promise<void> {
    await this.tx.execute(
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
