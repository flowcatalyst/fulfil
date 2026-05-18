import { Type, type Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../lastmile/common.js';
import { LastMileFulfilmentCreatedEventDataSchema } from '../lastmile/events/last-mile-fulfilment-created.schema.js';

/**
 * Inbound webhook from FlowCatalyst for the
 * `fulfil:lastmile:fulfilment:created` event type.
 *
 * Subscription is sync'd with `dataOnly: true`, so the body is the event's
 * `data` payload directly (no envelope wrapper).
 */
export const LastMileFulfilmentCreatedWebhookBodySchema =
  LastMileFulfilmentCreatedEventDataSchema;

export type LastMileFulfilmentCreatedWebhookBody = Static<
  typeof LastMileFulfilmentCreatedWebhookBodySchema
>;

/**
 * Two-branch reactor response. Discriminated on `status`:
 *  - `'shipment-requested'` → geo was ready; dispatch job emitted.
 *  - `'awaiting-geocoding'` → one or both legs need geocoding; the
 *    fulfilment has been parked with `reaction.awaitingEventType`.
 */
export const LastMileFulfilmentCreatedShipmentRequestedResponseSchema =
  Type.Object(
    {
      status: Type.Literal('shipment-requested'),
      dispatchJobId: Type.String(),
      targetUrl: Type.String({ format: 'uri' }),
    },
    { additionalProperties: false },
  );

export const LastMileFulfilmentCreatedAwaitingGeocodingResponseSchema =
  Type.Object(
    {
      status: Type.Literal('awaiting-geocoding'),
      fulfilmentId: Type.String(),
      missingLegs: Type.Array(
        Type.Union([Type.Literal('collection'), Type.Literal('dropOff')]),
      ),
      awaitingEventType: Type.String(),
    },
    { additionalProperties: false },
  );

export const LastMileFulfilmentCreatedWebhookResponseSchema = Type.Union([
  LastMileFulfilmentCreatedShipmentRequestedResponseSchema,
  LastMileFulfilmentCreatedAwaitingGeocodingResponseSchema,
]);
export type LastMileFulfilmentCreatedWebhookResponse = Static<
  typeof LastMileFulfilmentCreatedWebhookResponseSchema
>;

export const LastMileFulfilmentCreatedWebhookRouteSchema = {
  summary: 'Reactor: LastMileFulfilmentCreated.',
  description:
    'Inbound webhook from FlowCatalyst. Geo-ready fulfilments emit a `shipment-requested` response with the dispatch job id; ungeocoded ones return `awaiting-geocoding` and emit an event for a downstream geocoding orchestrator.',
  tags: ['Reactors'],
  body: LastMileFulfilmentCreatedWebhookBodySchema,
  response: {
    200: LastMileFulfilmentCreatedWebhookResponseSchema,
    400: ErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
} as const;
