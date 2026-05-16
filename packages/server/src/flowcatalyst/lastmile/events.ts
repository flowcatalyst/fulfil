import type { sync } from '@flowcatalyst/sdk';

/**
 * Event types Fulfil publishes for the LastMile subdomain.
 *
 * Codes follow `<app>:<subdomain>:<aggregate>:<event>`, lowercase + past-tense.
 * JSON Schemas live next to the route definitions in
 * `src/api/schemas/lastmile/events/` and are NOT synced via this list — the
 * sync API takes only the code+name+description triple.
 */
export const lastMileEventTypes: readonly sync.EventTypeDefinition[] = [
  {
    code: 'fulfil:lastmile:fulfilment:created',
    name: 'LastMile Fulfilment Created',
    description:
      'Emitted when a new LastMileFulfilment enters `awaiting_planning`. Carries the source-note ref, parties, promised window, and cargo counts.',
  },
  {
    code: 'fulfil:lastmile:fulfilment:shipment-requested',
    name: 'LastMile Fulfilment — Shipment Requested',
    description:
      'Emitted by the fulfilment reactor when it dispatches a shipment-creation job. Audit trail for what the reactor decided.',
  },
  {
    code: 'fulfil:lastmile:shipment:created',
    name: 'LastMile Shipment Created',
    description:
      'Emitted when a LastMileShipment is born from a fulfilment with status `unfinalised`.',
  },
  {
    code: 'fulfil:lastmile:fulfilment:shipment-linked',
    name: 'LastMile Fulfilment — Shipment Linked',
    description:
      'Emitted when the shipment-created reactor appends a new shipment onto its parent fulfilment\'s `linkedShipments`, closing the fulfilment ↔ shipment loop.',
  },
];
