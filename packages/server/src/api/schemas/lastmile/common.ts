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

// ─── Catalog enum schemas (TypeBox mirrors of shared domain catalogs) ───────
// `Type.Enum` accepts a const-asserted object and produces a schema whose
// Static type is the precise union of the catalog's values. This is what we
// want — losing the literals would degrade route body types to `string`.

export const SourceNoteTypeSchema = Type.Enum(SourceNoteType);
export const TemperatureZoneSchema = Type.Enum(TemperatureZone);
export const HandlingFlagSchema = Type.Enum(HandlingFlag);
export const ParcelTypeSchema = Type.Enum(ParcelType);
export const ParcelStatusSchema = Type.Enum(ParcelStatus);
export const UnitOfMeasureSchema = Type.Enum(UnitOfMeasure);
export const FailureReasonSchema = Type.Enum(FailureReason);
export const LastMileStageSchema = Type.Enum(LastMileStage);

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
