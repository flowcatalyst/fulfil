import { Type } from '@sinclair/typebox';
import {
  FailureReason,
  HandlingFlag,
  LastMileStage,
  ParcelStatus,
  ParcelType,
  SourceNoteType,
  TemperatureZone,
  UnitOfMeasure,
} from '@fulfil/shared';

// ─── Reusable helpers ───────────────────────────────────────────────────────

/**
 * Build a TypeBox union over the string values of a const catalog.
 * `Type.Enum` trips over const-asserted objects in some TypeBox versions, so
 * we build the union explicitly and export the schema with a stable name for
 * OpenAPI components registration.
 */
function literalUnion<const T extends readonly string[]>(values: T) {
  return Type.Union(values.map((v) => Type.Literal(v)));
}

// ─── Catalog unions (TypeBox mirrors of shared domain catalogs) ─────────────

export const SourceNoteTypeSchema = literalUnion(
  Object.values(SourceNoteType) as readonly string[],
);

export const TemperatureZoneSchema = literalUnion(
  Object.values(TemperatureZone) as readonly string[],
);

export const HandlingFlagSchema = literalUnion(
  Object.values(HandlingFlag) as readonly string[],
);

export const ParcelTypeSchema = literalUnion(
  Object.values(ParcelType) as readonly string[],
);

export const ParcelStatusSchema = literalUnion(
  Object.values(ParcelStatus) as readonly string[],
);

export const UnitOfMeasureSchema = literalUnion(
  Object.values(UnitOfMeasure) as readonly string[],
);

export const FailureReasonSchema = literalUnion(
  Object.values(FailureReason) as readonly string[],
);

export const LastMileStageSchema = literalUnion(
  Object.values(LastMileStage) as readonly string[],
);

// ─── Opaque passthrough metadata ────────────────────────────────────────────

export const MetadataSchema = Type.Record(
  Type.String({
    minLength: 1,
    maxLength: 64,
    pattern: '^[a-zA-Z0-9_.:-]+$',
  }),
  Type.String({ maxLength: 2048 }),
  {
    description:
      'Opaque passthrough key-value data. Fulfil never interprets this — stored and echoed verbatim on events. Max 50 entries; keys match ^[a-zA-Z0-9_.:-]+$.',
    maxProperties: 50,
    default: {},
  },
);

// ─── Error response — reusable across all endpoints ─────────────────────────

export const ErrorResponseSchema = Type.Object(
  {
    error: Type.Object(
      {
        type: Type.Union([
          Type.Literal('validation'),
          Type.Literal('authorization'),
          Type.Literal('not_found'),
          Type.Literal('business_rule'),
          Type.Literal('concurrency'),
          Type.Literal('infrastructure'),
        ]),
        code: Type.String(),
        message: Type.String(),
        details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
