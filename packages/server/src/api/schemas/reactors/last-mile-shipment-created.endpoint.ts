import { Type, type Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../lastmile/common.js';
import { LastMileShipmentCreatedEventDataSchema } from '../lastmile/events/last-mile-shipment-created.schema.js';

/**
 * Inbound webhook from FlowCatalyst for the
 * `fulfil:lastmile:shipment:created` event type. `dataOnly: true` on the
 * subscription so the body is the event's `data` payload directly.
 */
export const LastMileShipmentCreatedWebhookBodySchema =
  LastMileShipmentCreatedEventDataSchema;

export type LastMileShipmentCreatedWebhookBody = Static<
  typeof LastMileShipmentCreatedWebhookBodySchema
>;

export const LastMileShipmentCreatedWebhookResponseSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal('accepted'),
      Type.Literal('skipped_duplicate'),
    ]),
    fulfilmentId: Type.Optional(Type.String()),
    linkedShipmentCount: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
export type LastMileShipmentCreatedWebhookResponse = Static<
  typeof LastMileShipmentCreatedWebhookResponseSchema
>;

export const LastMileShipmentCreatedWebhookRouteSchema = {
  summary: 'Reactor: LastMileShipmentCreated.',
  description:
    'Inbound webhook from FlowCatalyst. Appends the new shipment to its parent fulfilment\'s `linkedShipments` and clears the fulfilment\'s reaction bookkeeping.',
  tags: ['Reactors'],
  body: LastMileShipmentCreatedWebhookBodySchema,
  response: {
    200: LastMileShipmentCreatedWebhookResponseSchema,
    400: ErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
} as const;
