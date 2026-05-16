import { Type, type Static } from '@sinclair/typebox';
import {
  ErrorResponseSchema,
  ShipmentStatusSchema,
} from '../common.js';

// ─── Request ────────────────────────────────────────────────────────────────

export const MarkShipmentReadyParamsSchema = Type.Object(
  {
    shipmentId: Type.String({ minLength: 1, maxLength: 40 }),
  },
  { additionalProperties: false },
);
export type MarkShipmentReadyParams = Static<
  typeof MarkShipmentReadyParamsSchema
>;

export const MarkShipmentReadyBodySchema = Type.Object(
  {
    note: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  {
    additionalProperties: false,
    description:
      'Optional metadata accompanying the ready transition (operator note for the audit trail).',
  },
);
export type MarkShipmentReadyBody = Static<typeof MarkShipmentReadyBodySchema>;

// ─── Response ───────────────────────────────────────────────────────────────

export const MarkShipmentReadyResponseSchema = Type.Object(
  {
    shipmentId: Type.String(),
    tenantId: Type.String(),
    fulfilmentId: Type.String(),
    status: ShipmentStatusSchema,
    readiedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);
export type MarkShipmentReadyResponse = Static<
  typeof MarkShipmentReadyResponseSchema
>;

export const MarkShipmentReadyRouteSchema = {
  summary: 'Mark a shipment as ready for planning.',
  description:
    'Transitions a shipment from `unfinalised` → `ready` once goods are confirmed packed. The shipment becomes eligible to be planned onto a trip.',
  tags: ['LastMile'],
  params: MarkShipmentReadyParamsSchema,
  body: MarkShipmentReadyBodySchema,
  response: {
    200: MarkShipmentReadyResponseSchema,
    400: ErrorResponseSchema,
    403: ErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
} as const;
