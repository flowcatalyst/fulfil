import { BaseDomainEvent, DomainEvent } from '@fulfil/framework';
import type { Scope } from '@fulfil/framework';
import type {
  LastMileFulfilmentId,
  ShipmentId,
  TenantId,
} from '../ids.js';

/**
 * Fact: a shipment has transitioned `unfinalised → ready`. Goods are
 * confirmed packed and the shipment is now eligible to be planned onto a
 * trip.
 *
 * Subject is the shipment. The fulfilment can observe this via a future
 * reactor that mirrors the status into its `LinkedShipment` snapshot.
 */
export interface LastMileShipmentReadyData {
  readonly shipmentId: ShipmentId;
  readonly tenantId: TenantId;
  readonly fulfilmentId: LastMileFulfilmentId;
  /** Optional operator note recorded at the time of marking ready. */
  readonly note: string | null;
}

export class LastMileShipmentReady extends BaseDomainEvent<LastMileShipmentReadyData> {
  constructor(scope: Scope, data: LastMileShipmentReadyData) {
    super(
      {
        eventType: DomainEvent.eventType(
          'fulfil',
          'lastmile',
          'shipment',
          'ready',
        ),
        specVersion: '1.0',
        source: 'fulfil:lastmile',
        subject: DomainEvent.subject('lastmile', 'shipment', data.shipmentId),
        messageGroup: DomainEvent.messageGroup(
          'lastmile',
          'shipment',
          data.shipmentId,
        ),
      },
      scope as never,
      data,
    );
  }
}
