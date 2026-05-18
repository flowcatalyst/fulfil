import type { sync } from '@flowcatalyst/sdk';

/**
 * Subscriptions Fulfil consumes for the LastMile subdomain.
 *
 * Targets are constructed from `FULFIL_PUBLIC_BASE_URL` at sync time. One
 * subscription per *process* — multiple event types bind onto it via
 * `eventTypes: [...]`. The process webhook routes internally on
 * `x-fc-event-type` (see the Processes section of CLAUDE.md).
 *
 * `dataOnly: true` — the subscription POSTs only the event's `data`
 * payload to the process route. Platform metadata (eventId,
 * correlationId, eventType, etc.) ride on `x-fc-*` headers.
 */
export const lastMileSubscriptions = (
  publicBaseUrl: string,
  dispatchPoolCode: string,
): readonly sync.SubscriptionDefinition[] => [
  {
    code: 'last-mile-fulfilment-process',
    name: 'LastMile Fulfilment Process',
    description:
      'Single process webhook subscribed to every event that drives the LastMile fulfilment lifecycle. Internally routes on event type to per-event handlers; cross-aggregate work is dispatched.',
    target: `${publicBaseUrl}/processes/last-mile-fulfilment`,
    eventTypes: [
      { eventTypeCode: 'fulfil:lastmile:fulfilment:created' },
      { eventTypeCode: 'fulfil:lastmile:shipment:created' },
    ],
    dispatchPoolCode,
    mode: 'BLOCK_ON_ERROR',
    maxRetries: 5,
    timeoutSeconds: 30,
    dataOnly: true,
  },
];
