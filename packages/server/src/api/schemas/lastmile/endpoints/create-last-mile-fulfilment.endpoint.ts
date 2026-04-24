import { Type, type Static } from '@sinclair/typebox';
import {
  ErrorResponseSchema,
  HandlingFlagSchema,
  MetadataSchema,
  TemperatureZoneSchema,
} from '../common.js';
import {
  CollectionPointSchema,
  ConsigneeSchema,
  DropOffPointSchema,
  OrderRefSchema,
  ParcelDraftSchema,
  PromisedLineDraftSchema,
  PromisedWindowSchema,
  SourceNoteRefSchema,
} from '../value-objects.js';

// ─── Request body ───────────────────────────────────────────────────────────

export const CreateLastMileFulfilmentBodySchema = Type.Object(
  {
    sourceNote: SourceNoteRefSchema,
    orderRef: Type.Optional(OrderRefSchema),

    collection: CollectionPointSchema,
    dropOff: DropOffPointSchema,
    consignee: ConsigneeSchema,
    promisedWindow: PromisedWindowSchema,

    lines: Type.Optional(Type.Array(PromisedLineDraftSchema)),
    parcels: Type.Optional(Type.Array(ParcelDraftSchema)),

    temperatureZone: Type.Optional(TemperatureZoneSchema),
    handling: Type.Optional(Type.Array(HandlingFlagSchema)),

    metadata: Type.Optional(MetadataSchema),
  },
  {
    additionalProperties: false,
    description:
      'Create a LastMileFulfilment against one upstream source note. Value objects arrive fully hydrated — master-data lookup (location, courier, vehicle) is the caller’s responsibility, not this use case’s.',
  },
);
export type CreateLastMileFulfilmentBody = Static<
  typeof CreateLastMileFulfilmentBodySchema
>;

// ─── Success response ───────────────────────────────────────────────────────

export const CreateLastMileFulfilmentResponseSchema = Type.Object(
  {
    fulfilmentId: Type.String(),
    tenantId: Type.String(),
    sourceNote: SourceNoteRefSchema,
    stage: Type.Literal('awaiting_planning'),
    promisedWindow: PromisedWindowSchema,
    createdAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);
export type CreateLastMileFulfilmentResponse = Static<
  typeof CreateLastMileFulfilmentResponseSchema
>;

// ─── Full route schema (body + response map) ────────────────────────────────

export const CreateLastMileFulfilmentRouteSchema = {
  summary: 'Create a LastMileFulfilment.',
  description:
    'Accepts a fully-hydrated command and creates a new fulfilment in `awaiting_planning`. Enforces one active fulfilment per source note per tenant.',
  tags: ['LastMile'],
  body: CreateLastMileFulfilmentBodySchema,
  response: {
    201: CreateLastMileFulfilmentResponseSchema,
    400: ErrorResponseSchema,
    403: ErrorResponseSchema,
    404: ErrorResponseSchema,
    409: ErrorResponseSchema,
    500: ErrorResponseSchema,
  },
} as const;
