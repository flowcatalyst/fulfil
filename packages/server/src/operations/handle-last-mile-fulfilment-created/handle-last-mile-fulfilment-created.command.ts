/**
 * Input for the fulfilment-created reactor.
 *
 * Carries only the two fields the reactor actually needs to identify the
 * fulfilment — it loads everything else from the repository to avoid trusting
 * the upstream event's payload (which may be stale by the time the dispatch
 * arrives) and to dodge branded-id mismatches between the wire shape and the
 * domain types.
 *
 * Subscription's `dataOnly: true` setting means FlowCatalyst POSTs only the
 * event data — platform envelope fields (eventId, correlationId, etc.) arrive
 * via HTTP headers and are handled in the route, not the use case.
 */
export interface HandleLastMileFulfilmentCreatedInput {
  readonly fulfilmentId: string;
  readonly tenantId: string;
}
