import { Type, type Static } from '@sinclair/typebox';
import { ErrorResponseSchema } from '../common.js';

export const LinkShipmentToFulfilmentParamsSchema = Type.Object(
  {
    fulfilmentId: Type.String({ minLength: 1, maxLength: 40 }),
  },
  { additionalProperties: false },
);
export type LinkShipmentToFulfilmentParams = Static<
  typeof LinkShipmentToFulfilmentParamsSchema
>;

export const LinkShipmentToFulfilmentBodySchema = Type.Object(
  {
    shipmentId: Type.String({ minLength: 1, maxLength: 40 }),
    tenantId: Type.String({ minLength: 1, maxLength: 100 }),
    handledEventId: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
  },
  {
    additionalProperties: false,
    description:
      'Dispatch-target payload — invoked by the LastMile process when it observes a `shipment:created` event.',
  },
);
export type LinkShipmentToFulfilmentBody = Static<
  typeof LinkShipmentToFulfilmentBodySchema
>;

export const LinkShipmentToFulfilmentResponseSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal('linked'),
      Type.Literal('skipped_duplicate'),
    ]),
    fulfilmentId: Type.String(),
    linkedShipmentCount: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
export type LinkShipmentToFulfilmentResponse = Static<
  typeof LinkShipmentToFulfilmentResponseSchema
>;

export const LinkShipmentToFulfilmentRouteSchema = {
  summary: 'Dispatch target: link a new shipment onto its parent fulfilment.',
  description:
    'Appends a `LinkedShipment` to the fulfilment and clears the reaction bookkeeping. Called via dispatch job from the LastMile process. HMAC-verified.',
  tags: ['LastMile'],
  params: LinkShipmentToFulfilmentParamsSchema,
  body: LinkShipmentToFulfilmentBodySchema,
  response: {
    200: LinkShipmentToFulfilmentResponseSchema,
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
} as const;
