/**
 * Input for the fulfilment-created reactor.
 *
 * Carries only the two identifying fields plus `handledEventId` (for
 * reaction-bookkeeping idempotency on the awaiting-geocoding branch). The
 * reactor reads everything else (collection/dropOff geo, cargo) from the
 * freshly-loaded fulfilment to avoid trusting stale upstream payloads.
 *
 * Subscription's `dataOnly: true` setting means FlowCatalyst POSTs only
 * the event data — platform envelope fields (eventId, correlationId)
 * arrive via HTTP headers and are handled in the route.
 */
export interface HandleLastMileFulfilmentCreatedInput {
  readonly fulfilmentId: string;
  readonly tenantId: string;
  /** Originating event ID (from `x-fc-event-id`). Used as `reaction.lastHandledEventId` on the awaiting branch. */
  readonly handledEventId?: string;
}
