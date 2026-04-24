/**
 * Aggregate Registry
 *
 * Central dispatcher for persisting and deleting aggregates.
 * Maps aggregate types to their respective repository operations.
 */

import type { BaseEntity, NewEntity } from './schema/common.js';
import type { TransactionContext } from './transaction.js';

export interface AggregateHandler<T extends BaseEntity = BaseEntity> {
  readonly typeName: string;
  persist(aggregate: NewEntity<T>, tx: TransactionContext): Promise<T>;
  delete(aggregate: T, tx: TransactionContext): Promise<boolean>;
  extractId(aggregate: T | NewEntity<T>): string;
}

export interface AggregateRegistry {
  register<T extends BaseEntity>(handler: AggregateHandler<T>): void;
  persist<T extends BaseEntity>(
    aggregate: NewEntity<T>,
    tx: TransactionContext,
  ): Promise<T>;
  delete<T extends BaseEntity>(
    aggregate: T,
    tx: TransactionContext,
  ): Promise<boolean>;
  extractId<T extends BaseEntity>(aggregate: T | NewEntity<T>): string;
  extractTypeName<T extends BaseEntity>(aggregate: T | NewEntity<T>): string;
}

export interface TaggedAggregate<T extends BaseEntity = BaseEntity> {
  readonly _aggregateType: string;
  readonly aggregate: T | NewEntity<T>;
}

export function tagAggregate<T extends BaseEntity>(
  typeName: string,
  aggregate: T | NewEntity<T>,
): TaggedAggregate<T> {
  return { _aggregateType: typeName, aggregate };
}

export function isTaggedAggregate(obj: unknown): obj is TaggedAggregate {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '_aggregateType' in obj &&
    'aggregate' in obj
  );
}

/**
 * Create an aggregate registry.
 *
 * @param prefixMap - Optional mapping of ID prefixes to handler type names.
 *   Example: `{ ord: 'Order', drv: 'Driver' }`
 */
export function createAggregateRegistry(
  prefixMap?: Record<string, string>,
): AggregateRegistry {
  const handlers = new Map<string, AggregateHandler>();

  return {
    register<T extends BaseEntity>(handler: AggregateHandler<T>): void {
      handlers.set(handler.typeName, handler as AggregateHandler);
    },

    async persist<T extends BaseEntity>(
      aggregate: NewEntity<T>,
      tx: TransactionContext,
    ): Promise<T> {
      const typeName = this.extractTypeName(aggregate);
      const handler = handlers.get(typeName);

      if (!handler) {
        throw new Error(
          `No handler registered for aggregate type: ${typeName}. ` +
            `Registered types: ${Array.from(handlers.keys()).join(', ')}`,
        );
      }

      return handler.persist(
        aggregate as NewEntity<BaseEntity>,
        tx,
      ) as Promise<T>;
    },

    async delete<T extends BaseEntity>(
      aggregate: T,
      tx: TransactionContext,
    ): Promise<boolean> {
      const typeName = this.extractTypeName(aggregate);
      const handler = handlers.get(typeName);

      if (!handler) {
        throw new Error(
          `No handler registered for aggregate type: ${typeName}. ` +
            `Registered types: ${Array.from(handlers.keys()).join(', ')}`,
        );
      }

      return handler.delete(aggregate as BaseEntity, tx);
    },

    extractId<T extends BaseEntity>(aggregate: T | NewEntity<T>): string {
      if (isTaggedAggregate(aggregate)) {
        const inner = aggregate.aggregate;
        if ('id' in inner && typeof inner.id === 'string') {
          return inner.id;
        }
        throw new Error('Tagged aggregate does not have an id field');
      }

      if ('id' in aggregate && typeof aggregate.id === 'string') {
        return aggregate.id;
      }

      throw new Error('Aggregate does not have an id field');
    },

    extractTypeName<T extends BaseEntity>(
      aggregate: T | NewEntity<T>,
    ): string {
      if (isTaggedAggregate(aggregate)) {
        return aggregate._aggregateType;
      }

      const constructor = (aggregate as object).constructor;
      if (constructor && constructor.name && constructor.name !== 'Object') {
        return constructor.name;
      }

      if (prefixMap) {
        const obj = aggregate as Record<string, unknown>;
        if (typeof obj['id'] === 'string') {
          const id = obj['id'];
          const underscoreIdx = id.indexOf('_');
          if (underscoreIdx > 0) {
            const prefix = id.slice(0, underscoreIdx);
            const typeName = prefixMap[prefix];
            if (typeName && handlers.has(typeName)) {
              return typeName;
            }
          }
        }
      }

      throw new Error(
        'Cannot determine aggregate type. Use tagAggregate() to wrap the aggregate with type information, ' +
          'or use a class instance instead of a plain object.',
      );
    },
  };
}

export function createAggregateHandler<T extends BaseEntity>(
  typeName: string,
  repository: {
    persist(entity: NewEntity<T>, tx?: TransactionContext): Promise<T>;
    delete(entity: T, tx?: TransactionContext): Promise<boolean>;
  },
): AggregateHandler<T> {
  return {
    typeName,
    persist: (aggregate, tx) => repository.persist(aggregate, tx),
    delete: (aggregate, tx) => repository.delete(aggregate, tx),
    extractId: (aggregate) => {
      if ('id' in aggregate && typeof aggregate.id === 'string') {
        return aggregate.id;
      }
      throw new Error(`Cannot extract id from ${typeName} aggregate`);
    },
  };
}
