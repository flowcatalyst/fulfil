import {
  LAST_MILE_SHIPMENT_TYPE,
  type LastMileShipment,
} from '../domain/lastmile/last-mile-shipment.js';
import type { LastMileShipmentRepository } from '../domain/lastmile/last-mile-shipment.repository.js';
import type { AggregateRegistry } from './aggregate-registry.js';

/**
 * Wire the LastMileShipment aggregate into the shared AggregateRegistry.
 *
 * @example
 *   const registry = createAggregateRegistry({
 *     lmf: LAST_MILE_FULFILMENT_TYPE,
 *     shp: LAST_MILE_SHIPMENT_TYPE,
 *   });
 *   const shipmentRepo = createDrizzleLastMileShipmentRepository(db);
 *   registerLastMileShipment(registry, shipmentRepo);
 */
export function registerLastMileShipment(
  registry: AggregateRegistry,
  repository: LastMileShipmentRepository,
): void {
  registry.register<LastMileShipment>({
    typeName: LAST_MILE_SHIPMENT_TYPE,
    persist: async (entity, tx) =>
      repository.persist(entity as LastMileShipment, tx),
    delete: async (entity, tx) => repository.delete(entity, tx),
    extractId: (entity) => {
      if ('id' in entity && typeof entity.id === 'string') return entity.id;
      throw new Error(`Cannot extract id from ${LAST_MILE_SHIPMENT_TYPE}`);
    },
  });
}
