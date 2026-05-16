import { Type, type Static } from '@sinclair/typebox';
import {
  ErrorResponseSchema,
  HandlingFlagSchema,
  MetadataSchema,
  ShipmentStatusSchema,
  TemperatureZoneSchema,
} from '../common.js';
import {
  CollectionPointSchema,
  ConsigneeSchema,
  DropOffPointSchema,
  ParcelSchema,
  PromisedLineSchema,
  PromisedWindowSchema,
} from '../value-objects.js';

// ─── Request body ───────────────────────────────────────────────────────────

export const CreateLastMileShipmentBodySchema = Type.Object(
  {
    tenantId: Type.String({ minLength: 1, maxLength: 100 }),
    fulfilmentId: Type.String({ minLength: 1, maxLength: 40 }),

    collection: CollectionPointSchema,
    dropOff: DropOffPointSchema,
    consignee: ConsigneeSchema,
    promisedWindow: PromisedWindowSchema,

    lines: Type.Optional(Type.Array(PromisedLineSchema)),
    parcels: Type.Optional(Type.Array(ParcelSchema)),

    temperatureZone: Type.Optional(TemperatureZoneSchema),
    handling: Type.Optional(Type.Array(HandlingFlagSchema)),

    metadata: Type.Optional(MetadataSchema),
  },
  {
    additionalProperties: false,
    description:
      'Create a LastMileShipment from a fulfilment. Typically invoked by the fulfilment reactor via a dispatch job — not a user-facing endpoint.',
  },
);
export type CreateLastMileShipmentBody = Static<
  typeof CreateLastMileShipmentBodySchema
>;

// ─── Success response ───────────────────────────────────────────────────────

export const CreateLastMileShipmentResponseSchema = Type.Object(
  {
    shipmentId: Type.String(),
    tenantId: Type.String(),
    fulfilmentId: Type.String(),
    status: ShipmentStatusSchema,
    createdAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);
export type CreateLastMileShipmentResponse = Static<
  typeof CreateLastMileShipmentResponseSchema
>;

export const CreateLastMileShipmentRouteSchema = {
  summary: 'Create a LastMileShipment.',
  description:
    'Spawns a shipment from a fulfilment with the cargo + locations + window snapshotted at dispatch time. Status starts at `unfinalised`.',
  tags: ['LastMile'],
  body: CreateLastMileShipmentBodySchema,
  response: {
    201: CreateLastMileShipmentResponseSchema,
    400: ErrorResponseSchema,
    403: ErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
} as const;
