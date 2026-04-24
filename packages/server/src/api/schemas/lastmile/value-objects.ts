import { Type } from '@sinclair/typebox';
import {
  HandlingFlagSchema,
  MetadataSchema,
  ParcelStatusSchema,
  ParcelTypeSchema,
  SourceNoteTypeSchema,
  TemperatureZoneSchema,
  UnitOfMeasureSchema,
} from './common.js';

// ─── Primitives ─────────────────────────────────────────────────────────────

export const AddressSchema = Type.Object(
  {
    line1: Type.String({ minLength: 1, maxLength: 500 }),
    line2: Type.Optional(Type.String({ maxLength: 500 })),
    city: Type.String({ minLength: 1, maxLength: 200 }),
    region: Type.Optional(Type.String({ maxLength: 200 })),
    postalCode: Type.Optional(Type.String({ maxLength: 40 })),
    countryCode: Type.String({ minLength: 2, maxLength: 2 }),
  },
  { additionalProperties: false, description: 'Postal address (ISO country code).' },
);

export const GeoPointSchema = Type.Object(
  {
    lat: Type.Number({ minimum: -90, maximum: 90 }),
    lng: Type.Number({ minimum: -180, maximum: 180 }),
  },
  { additionalProperties: false },
);

export const ContactRefSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 200 }),
    phone: Type.String({ minLength: 1, maxLength: 40 }),
    email: Type.Optional(
      Type.String({ format: 'email', maxLength: 320 }),
    ),
  },
  { additionalProperties: false },
);

// ─── Parties ────────────────────────────────────────────────────────────────

export const ConsigneeSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 200 }),
    phone: Type.String({ minLength: 1, maxLength: 40 }),
    email: Type.Optional(
      Type.String({ format: 'email', maxLength: 320 }),
    ),
    alternateContact: Type.Optional(
      Type.Object(
        {
          name: Type.String({ minLength: 1, maxLength: 200 }),
          phone: Type.String({ minLength: 1, maxLength: 40 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

// ─── Time windows ───────────────────────────────────────────────────────────
// Dates arrive as ISO 8601 strings on the wire; the use case's Zod parse
// coerces them to Date instances. Semantic validation (end > start) is
// enforced inside the use case's validate phase — JSON Schema can't express it.

export const TimeWindowSchema = Type.Object(
  {
    start: Type.String({ format: 'date-time' }),
    end: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

export const PromisedWindowSchema = TimeWindowSchema;

// ─── Locations ──────────────────────────────────────────────────────────────

export const AccessConstraintsSchema = Type.Object(
  {
    maxVehicleLengthMm: Type.Optional(Type.Integer({ minimum: 1 })),
    maxVehicleWidthMm: Type.Optional(Type.Integer({ minimum: 1 })),
    maxVehicleHeightMm: Type.Optional(Type.Integer({ minimum: 1 })),
    maxGrossWeightKg: Type.Optional(Type.Integer({ minimum: 1 })),
    requiresTailLift: Type.Optional(Type.Boolean()),
    requiresForklift: Type.Optional(Type.Boolean()),
    requiresCrane: Type.Optional(Type.Boolean()),
    notes: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  {
    additionalProperties: false,
    description:
      'Constraints on the vehicle imposed by the delivery site (bridge height, gate width, required equipment).',
  },
);

export const CollectionPointSchema = Type.Object(
  {
    locationId: Type.Optional(Type.String({ maxLength: 40 })),
    name: Type.String({ minLength: 1, maxLength: 200 }),
    address: AddressSchema,
    geo: GeoPointSchema,
    dockRef: Type.Optional(Type.String({ maxLength: 100 })),
    contact: Type.Optional(ContactRefSchema),
    collectionWindow: Type.Optional(TimeWindowSchema),
    accessNotes: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { additionalProperties: false },
);

export const DropOffPointSchema = Type.Object(
  {
    locationId: Type.Optional(Type.String({ maxLength: 40 })),
    name: Type.String({ minLength: 1, maxLength: 200 }),
    address: AddressSchema,
    geo: GeoPointSchema,
    access: Type.Optional(AccessConstraintsSchema),
    deliveryInstructions: Type.Optional(Type.String({ maxLength: 2000 })),
    unattendedDeliveryAllowed: Type.Boolean(),
  },
  { additionalProperties: false },
);

// ─── Source-document references ─────────────────────────────────────────────

export const SourceNoteRefSchema = Type.Object(
  {
    system: Type.String({ minLength: 1, maxLength: 100 }),
    type: SourceNoteTypeSchema,
    number: Type.String({ minLength: 1, maxLength: 100 }),
    revision: Type.Optional(Type.Integer({ minimum: 0, default: 1 })),
  },
  { additionalProperties: false },
);

export const OrderRefSchema = Type.Object(
  {
    system: Type.String({ minLength: 1, maxLength: 100 }),
    number: Type.String({ minLength: 1, maxLength: 100 }),
  },
  { additionalProperties: false },
);

// ─── Cargo drafts (what clients submit on create — IDs generated server-side) ─

export const PromisedLineDraftSchema = Type.Object(
  {
    lineId: Type.Optional(Type.String({ maxLength: 40 })),
    sku: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.String({ minLength: 1, maxLength: 2000 }),
    quantity: Type.Number({ exclusiveMinimum: 0 }),
    uom: UnitOfMeasureSchema,
    sourceLineRef: Type.Optional(Type.String({ maxLength: 200 })),
    metadata: Type.Optional(MetadataSchema),
  },
  { additionalProperties: false },
);

export const ParcelDraftSchema = Type.Object(
  {
    parcelId: Type.Optional(Type.String({ maxLength: 40 })),
    type: ParcelTypeSchema,
    label: Type.Optional(Type.String({ maxLength: 200 })),
    weightGrams: Type.Integer({ minimum: 1 }),
    lengthMm: Type.Optional(Type.Integer({ minimum: 1 })),
    widthMm: Type.Optional(Type.Integer({ minimum: 1 })),
    heightMm: Type.Optional(Type.Integer({ minimum: 1 })),
    volumeCm3: Type.Optional(Type.Integer({ minimum: 1 })),
    lineRefs: Type.Optional(Type.Array(Type.String({ maxLength: 40 }))),
    status: Type.Optional(ParcelStatusSchema),
    metadata: Type.Optional(MetadataSchema),
  },
  { additionalProperties: false },
);

// ─── Persisted-form cargo value objects (referenced by event payload) ───────

export const PromisedLineSchema = Type.Object(
  {
    lineId: Type.String({ maxLength: 40 }),
    sku: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.String({ minLength: 1, maxLength: 2000 }),
    quantity: Type.Number({ exclusiveMinimum: 0 }),
    uom: UnitOfMeasureSchema,
    sourceLineRef: Type.Optional(Type.String({ maxLength: 200 })),
    metadata: MetadataSchema,
  },
  { additionalProperties: false },
);

export const ParcelSchema = Type.Object(
  {
    parcelId: Type.String({ maxLength: 40 }),
    type: ParcelTypeSchema,
    label: Type.Optional(Type.String({ maxLength: 200 })),
    weightGrams: Type.Integer({ minimum: 1 }),
    lengthMm: Type.Optional(Type.Integer({ minimum: 1 })),
    widthMm: Type.Optional(Type.Integer({ minimum: 1 })),
    heightMm: Type.Optional(Type.Integer({ minimum: 1 })),
    volumeCm3: Type.Optional(Type.Integer({ minimum: 1 })),
    lineRefs: Type.Array(Type.String({ maxLength: 40 })),
    status: ParcelStatusSchema,
    metadata: MetadataSchema,
  },
  { additionalProperties: false },
);

// Referenced so HandlingFlagSchema keeps its `unused` warning clean when only
// consumed via array usage in this module.
export { HandlingFlagSchema };
