import { BaseDomainEvent, DomainEvent } from '@fulfil/framework';
import type { Scope } from '@fulfil/framework';
import type {
  LastMileFulfilmentId,
  ShipmentId,
  TenantId,
} from '../ids.js';

/**
 * Fact: the LastMile process observed a shipment-created event and
 * emitted a dispatch job to link the shipment back onto its parent
 * fulfilment. Audit trail for the decision; the actual linking happens
 * downstream in the dispatch target.
 *
 * Subject is the fulfilment (the action's target aggregate), not the
 * shipment (the event's source).
 */
export interface LastMileFulfilmentShipmentLinkDispatchedData {
  readonly fulfilmentId: LastMileFulfilmentId;
  readonly tenantId: TenantId;
  readonly shipmentId: ShipmentId;
  readonly dispatchJobId: string;
  readonly targetUrl: string;
}

export class LastMileFulfilmentShipmentLinkDispatched extends BaseDomainEvent<LastMileFulfilmentShipmentLinkDispatchedData> {
  constructor(
    scope: Scope,
    data: LastMileFulfilmentShipmentLinkDispatchedData,
  ) {
    super(
      {
        eventType: DomainEvent.eventType(
          'fulfil',
          'lastmile',
          'fulfilment',
          'shipment-link-dispatched',
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
