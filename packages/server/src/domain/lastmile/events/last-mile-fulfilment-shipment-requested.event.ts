import { BaseDomainEvent, DomainEvent } from '@fulfil/framework';
import type { Scope } from '@fulfil/framework';
import type { LastMileFulfilmentId, TenantId } from '../ids.js';

/**
 * Fact: the fulfilment reactor decided to request shipment creation for this
 * fulfilment and emitted a corresponding dispatch job.
 *
 * Emitted alongside the `CreateLastMileShipment` dispatch job by
 * `HandleLastMileFulfilmentCreatedUseCase`. Carries the dispatch-job ID for
 * audit / replay / debugging.
 *
 * Subject is the fulfilment (not the shipment) — the shipment doesn't exist
 * yet at the moment this fires.
 */
export interface LastMileFulfilmentShipmentRequestedData {
  readonly fulfilmentId: LastMileFulfilmentId;
  readonly tenantId: TenantId;
  /** The TSID returned by `OutboxManager.createDispatchJob`. */
  readonly dispatchJobId: string;
  /** Target URL the dispatch job will POST to. */
  readonly targetUrl: string;
}

export class LastMileFulfilmentShipmentRequested extends BaseDomainEvent<LastMileFulfilmentShipmentRequestedData> {
  constructor(
    scope: Scope,
    data: LastMileFulfilmentShipmentRequestedData,
  ) {
    super(
      {
        eventType: DomainEvent.eventType(
          'fulfil',
          'lastmile',
          'fulfilment',
          'shipment-requested',
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
