/**
 * Input for the shipment-created reactor.
 *
 * Carries only what the reactor needs to look up the shipment + headers
 * carry the rest. The reactor reads everything else (fulfilmentId, parcel/
 * line IDs, status) from the freshly-loaded shipment aggregate — never
 * trusting the inbound payload for state that the local DB owns.
 */
export interface HandleLastMileShipmentCreatedInput {
  readonly shipmentId: string;
  readonly tenantId: string;
  /** Originating event ID (from `x-fc-event-id`) — used for reaction idempotency. */
  readonly handledEventId: string;
}
