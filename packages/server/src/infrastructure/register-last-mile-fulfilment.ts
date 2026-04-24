import type {
  LastMileFulfilment,
} from '../domain/lastmile/last-mile-fulfilment.js';
import { LAST_MILE_FULFILMENT_TYPE } from '../domain/lastmile/last-mile-fulfilment.js';
import type { LastMileFulfilmentRepository } from '../domain/lastmile/last-mile-fulfilment.repository.js';
import type { AggregateRegistry } from './aggregate-registry.js';

/**
 * Wire the LastMileFulfilment aggregate into the shared AggregateRegistry.
 *
 * Call once during server bootstrap, after the registry is created with a
 * prefix map that includes `{ lmf: 'LastMileFulfilment' }` (so plain-object
 * aggregates resolve by id prefix at persist time).
 *
 * @example
 *   const registry = createAggregateRegistry({ lmf: LAST_MILE_FULFILMENT_TYPE });
 *   const fulfilmentRepo = createDrizzleLastMileFulfilmentRepository(db);
 *   registerLastMileFulfilment(registry, fulfilmentRepo);
 */
export function registerLastMileFulfilment(
  registry: AggregateRegistry,
  repository: LastMileFulfilmentRepository,
): void {
  registry.register<LastMileFulfilment>({
    typeName: LAST_MILE_FULFILMENT_TYPE,
    persist: async (entity, tx) =>
      repository.persist(entity as LastMileFulfilment, tx),
    delete: async (entity, tx) => repository.delete(entity, tx),
    extractId: (entity) => {
      if ('id' in entity && typeof entity.id === 'string') return entity.id;
      throw new Error(`Cannot extract id from ${LAST_MILE_FULFILMENT_TYPE}`);
    },
  });
}
