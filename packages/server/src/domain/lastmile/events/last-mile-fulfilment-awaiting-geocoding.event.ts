import { BaseDomainEvent, DomainEvent } from '@fulfil/framework';
import type { Scope } from '@fulfil/framework';
import type { LastMileFulfilmentId, TenantId } from '../ids.js';

/**
 * Fact: the fulfilment reactor inspected a new fulfilment, found one or
 * both location ends lacked geocoded coordinates, and parked the
 * fulfilment in `awaiting-geocoding`.
 *
 * Subject is the fulfilment. A client-specific orchestrator (e.g. Pinpoint)
 * subscribes to this event, performs geocoding via its provider, and is
 * expected to emit `LocationsGeocoded` (deferred — out of scope for the
 * core Fulfil platform) which would wake a subsequent reactor.
 *
 * Until then, the fulfilment's `reaction.awaitingEventType` records what
 * it's waiting for so dashboards and sweepers can surface stuck items.
 */
export interface LastMileFulfilmentAwaitingGeocodingData {
  readonly fulfilmentId: LastMileFulfilmentId;
  readonly tenantId: TenantId;
  /** Which leg(s) of the route still need geocoding. */
  readonly missingLegs: readonly ('collection' | 'dropOff')[];
}

export class LastMileFulfilmentAwaitingGeocoding extends BaseDomainEvent<LastMileFulfilmentAwaitingGeocodingData> {
  constructor(
    scope: Scope,
    data: LastMileFulfilmentAwaitingGeocodingData,
  ) {
    super(
      {
        eventType: DomainEvent.eventType(
          'fulfil',
          'lastmile',
          'fulfilment',
          'awaiting-geocoding',
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
