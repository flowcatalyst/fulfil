import { BaseDomainEvent, DomainEvent } from '@fulfil/framework';
import type { Scope } from '@fulfil/framework';
import type { ShipmentStatus } from '@fulfil/shared';
import type {
  LastMileFulfilmentId,
  ShipmentId,
  TenantId,
} from '../ids.js';

/**
 * Fact: a shipment has been linked back onto its parent fulfilment.
 *
 * Emitted by `HandleLastMileShipmentCreated` after appending the new
 * shipment to `linkedShipments` and clearing the fulfilment's
 * `reaction.awaitingEventType`. Subject is the fulfilment.
 */
export interface LastMileFulfilmentShipmentLinkedData {
  readonly fulfilmentId: LastMileFulfilmentId;
  readonly tenantId: TenantId;
  readonly shipmentId: ShipmentId;
  readonly shipmentStatus: ShipmentStatus;
  /** Total linked shipments on the fulfilment after this append. */
  readonly linkedShipmentCount: number;
}

export class LastMileFulfilmentShipmentLinked extends BaseDomainEvent<LastMileFulfilmentShipmentLinkedData> {
  constructor(scope: Scope, data: LastMileFulfilmentShipmentLinkedData) {
    super(
      {
        eventType: DomainEvent.eventType(
          'fulfil',
          'lastmile',
          'fulfilment',
          'shipment-linked',
        ),
        specVersion: '1.0',
        source: 'fulfil:lastmile',
        subject: DomainEvent.subject(
          'lastmile',
          'fulfilment',
          data.fulfilmentId,
        ),
        messageGroup: DomainEvent.messageGroup(
          'lastmile',
          'fulfilment',
          data.fulfilmentId,
        ),
      },
      scope as never,
      data,
    );
  }
}
