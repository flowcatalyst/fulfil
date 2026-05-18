import { Type, type Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../lastmile/common.js';
import { LastMileFulfilmentCreatedEventDataSchema } from '../lastmile/events/last-mile-fulfilment-created.schema.js';
import { LastMileShipmentCreatedEventDataSchema } from '../lastmile/events/last-mile-shipment-created.schema.js';

/**
 * Inbound webhook for the LastMile fulfilment process — one endpoint
 * subscribed to multiple event types. The body is the event's `data`
 * payload (FlowCatalyst subscription has `dataOnly: true`); the event
 * type is read from the `x-fc-event-type` header to dispatch internally.
 */
export const LastMileFulfilmentProcessBodySchema = Type.Union([
  LastMileFulfilmentCreatedEventDataSchema,
  LastMileShipmentCreatedEventDataSchema,
]);
export type LastMileFulfilmentProcessBody = Static<
  typeof LastMileFulfilmentProcessBodySchema
>;

// ─── Response — discriminated union over the action the process took ────────

export const LastMileFulfilmentProcessShipmentRequestedResponseSchema =
  Type.Object(
    {
      status: Type.Literal('shipment-requested'),
      dispatchJobId: Type.String(),
      targetUrl: Type.String({ format: 'uri' }),
    },
    { additionalProperties: false },
  );

export const LastMileFulfilmentProcessAwaitingGeocodingResponseSchema =
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

export const LastMileFulfilmentProcessShipmentLinkDispatchedResponseSchema =
  Type.Object(
    {
      status: Type.Literal('shipment-link-dispatched'),
      dispatchJobId: Type.String(),
      targetUrl: Type.String({ format: 'uri' }),
    },
    { additionalProperties: false },
  );

export const LastMileFulfilmentProcessResponseSchema = Type.Union([
  LastMileFulfilmentProcessShipmentRequestedResponseSchema,
  LastMileFulfilmentProcessAwaitingGeocodingResponseSchema,
  LastMileFulfilmentProcessShipmentLinkDispatchedResponseSchema,
]);
export type LastMileFulfilmentProcessResponse = Static<
  typeof LastMileFulfilmentProcessResponseSchema
>;

export const LastMileFulfilmentProcessRouteSchema = {
  summary: 'Process webhook: LastMile fulfilment.',
  description:
    'Single endpoint subscribed to every event that drives the LastMile fulfilment process. Routes on `x-fc-event-type` to per-event handlers; each handler decides and emits dispatch jobs.',
  tags: ['Processes'],
  body: LastMileFulfilmentProcessBodySchema,
  response: {
    200: LastMileFulfilmentProcessResponseSchema,
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
} as const;
