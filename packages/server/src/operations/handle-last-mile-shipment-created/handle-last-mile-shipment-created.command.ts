/**
 * Input for the shipment-created process handler.
 *
 * Carries just enough to (a) construct the link-shipment dispatch URL and
 * (b) record an audit event. The downstream dispatch target loads the
 * shipment + fulfilment from the repository itself.
 */
export interface HandleLastMileShipmentCreatedInput {
  readonly shipmentId: string;
  readonly tenantId: string;
  readonly fulfilmentId: string;
  /** Originating event ID (from `x-fc-event-id`) — propagated for downstream idempotency. */
  readonly handledEventId?: string;
}
