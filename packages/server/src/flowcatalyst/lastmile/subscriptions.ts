import type { sync } from '@flowcatalyst/sdk';

/**
 * Subscriptions Fulfil consumes for the LastMile subdomain.
 *
 * Targets are constructed from `FULFIL_PUBLIC_BASE_URL` at sync time. The
 * resulting URL must be reachable from the FlowCatalyst dispatcher.
 *
 * `dataOnly: true` — the subscription POSTs only the event's `data` payload
 * to the reactor. Platform metadata (eventId, correlationId, etc.) ride on
 * HTTP headers, which the route handler reads to chain `Scope.fromParentEvent`.
 */
export const lastMileSubscriptions = (
  publicBaseUrl: string,
  dispatchPoolCode: string,
): readonly sync.SubscriptionDefinition[] => [
  {
    code: 'last-mile-fulfilment-reactor',
    name: 'LastMile Fulfilment Reactor',
    description:
      'Drives the reactor that spawns a shipment when a new fulfilment is geocoded and ready for planning.',
    target: `${publicBaseUrl}/reactors/last-mile-fulfilment-created`,
    eventTypes: [{ eventTypeCode: 'fulfil:lastmile:fulfilment:created' }],
    dispatchPoolCode,
    mode: 'BLOCK_ON_ERROR',
    maxRetries: 5,
    timeoutSeconds: 30,
    dataOnly: true,
  },
  {
    code: 'last-mile-shipment-created-reactor',
    name: 'LastMile Shipment Created Reactor',
    description:
      'Closes the fulfilment ↔ shipment loop: appends the new shipment onto its parent fulfilment\'s `linkedShipments` and clears the fulfilment\'s reaction bookkeeping.',
    target: `${publicBaseUrl}/reactors/last-mile-shipment-created`,
    eventTypes: [{ eventTypeCode: 'fulfil:lastmile:shipment:created' }],
    dispatchPoolCode,
    mode: 'BLOCK_ON_ERROR',
    maxRetries: 5,
    timeoutSeconds: 30,
    dataOnly: true,
  },
];
