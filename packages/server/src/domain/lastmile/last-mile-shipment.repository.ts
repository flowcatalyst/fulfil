import type { TransactionContext } from '../../infrastructure/transaction.js';
import type {
  LastMileFulfilmentId,
  ShipmentId,
  TenantId,
} from './ids.js';
import type { LastMileShipment } from './last-mile-shipment.js';

export interface LastMileShipmentRepository {
  persist(
    aggregate: LastMileShipment,
    tx?: TransactionContext,
  ): Promise<LastMileShipment>;

  delete(
    aggregate: LastMileShipment,
    tx?: TransactionContext,
  ): Promise<boolean>;

  findById(
    tenantId: TenantId,
    id: ShipmentId,
  ): Promise<LastMileShipment | null>;

  /** All shipments for a given fulfilment — used by the fulfilment reactor. */
  findByFulfilment(
    tenantId: TenantId,
    fulfilmentId: LastMileFulfilmentId,
  ): Promise<readonly LastMileShipment[]>;
}
