import { Type, type Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../lastmile/common.js';
import { LastMileFulfilmentCreatedEventDataSchema } from '../lastmile/events/last-mile-fulfilment-created.schema.js';

/**
 * Inbound webhook from FlowCatalyst for the
 * `fulfil:lastmile:fulfilment:created` event type.
 *
 * Subscription is sync'd with `dataOnly: true`, so the body is the event's
 * `data` payload directly (no envelope wrapper). Platform metadata
 * (eventId, correlationId, etc.) arrives via HTTP headers — the route
 * handler reads them to chain the reactor's scope to the originating event.
 */
export const LastMileFulfilmentCreatedWebhookBodySchema =
  LastMileFulfilmentCreatedEventDataSchema;

export type LastMileFulfilmentCreatedWebhookBody = Static<
  typeof LastMileFulfilmentCreatedWebhookBodySchema
>;

export const LastMileFulfilmentCreatedWebhookResponseSchema = Type.Object(
  {
    status: Type.Literal('accepted'),
    dispatchJobId: Type.String(),
    targetUrl: Type.String({ format: 'uri' }),
  },
  { additionalProperties: false },
);
export type LastMileFulfilmentCreatedWebhookResponse = Static<
  typeof LastMileFulfilmentCreatedWebhookResponseSchema
>;

export const LastMileFulfilmentCreatedWebhookRouteSchema = {
  summary: 'Reactor: LastMileFulfilmentCreated.',
  description:
    'Inbound webhook from FlowCatalyst. Decides whether to spawn a shipment (geocoded → dispatch job) or wait for geocoding. Subscription registers this URL.',
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
