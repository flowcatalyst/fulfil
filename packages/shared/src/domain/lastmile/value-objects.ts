import { z } from 'zod';
import { MetadataSchema } from '../metadata.js';
import {
  ParcelStatusSchema,
  ParcelTypeSchema,
  SourceNoteTypeSchema,
  UnitOfMeasureSchema,
} from './catalogs.js';

// ─── Primitive value objects ────────────────────────────────────────────────

export const AddressSchema = z
  .object({
    line1: z.string().min(1).max(500),
    line2: z.string().max(500).optional(),
    city: z.string().min(1).max(200),
    region: z.string().max(200).optional(),
    postalCode: z.string().max(40).optional(),
    countryCode: z.string().length(2).toUpperCase(),
  })
  .strict();
export type Address = z.infer<typeof AddressSchema>;

export const GeoPointSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();
export type GeoPoint = z.infer<typeof GeoPointSchema>;

export const ContactRefSchema = z
  .object({
    name: z.string().min(1).max(200),
    phone: z.string().min(1).max(40),
    email: z.string().email().max(320).optional(),
  })
  .strict();
export type ContactRef = z.infer<typeof ContactRefSchema>;

// ─── Parties ────────────────────────────────────────────────────────────────

export const ConsigneeSchema = z
  .object({
    name: z.string().min(1).max(200),
    phone: z.string().min(1).max(40),
    email: z.string().email().max(320).optional(),
    alternateContact: z
      .object({
        name: z.string().min(1).max(200),
        phone: z.string().min(1).max(40),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Consignee = z.infer<typeof ConsigneeSchema>;

// ─── Time windows ───────────────────────────────────────────────────────────

const timeWindow = z
  .object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .strict()
  .refine((w) => w.end > w.start, { message: 'end must be after start' });

export const PromisedWindowSchema = timeWindow;
export type PromisedWindow = z.infer<typeof PromisedWindowSchema>;

// ─── Locations ──────────────────────────────────────────────────────────────

export const AccessConstraintsSchema = z
  .object({
    maxVehicleLengthMm: z.number().int().positive().optional(),
    maxVehicleWidthMm: z.number().int().positive().optional(),
    maxVehicleHeightMm: z.number().int().positive().optional(),
    maxGrossWeightKg: z.number().int().positive().optional(),
    requiresTailLift: z.boolean().optional(),
    requiresForklift: z.boolean().optional(),
    requiresCrane: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type AccessConstraints = z.infer<typeof AccessConstraintsSchema>;

export const CollectionPointSchema = z
  .object({
    locationId: z.string().max(40).optional(),
    name: z.string().min(1).max(200),
    address: AddressSchema,
    geo: GeoPointSchema,
    dockRef: z.string().max(100).optional(),
    contact: ContactRefSchema.optional(),
    collectionWindow: timeWindow.optional(),
    accessNotes: z.string().max(2000).optional(),
  })
  .strict();
export type CollectionPoint = z.infer<typeof CollectionPointSchema>;

export const DropOffPointSchema = z
  .object({
    locationId: z.string().max(40).optional(),
    name: z.string().min(1).max(200),
    address: AddressSchema,
    geo: GeoPointSchema,
    access: AccessConstraintsSchema.default({}),
    deliveryInstructions: z.string().max(2000).optional(),
    unattendedDeliveryAllowed: z.boolean(),
  })
  .strict();
export type DropOffPoint = z.infer<typeof DropOffPointSchema>;

// ─── Source document references ─────────────────────────────────────────────

export const SourceNoteRefSchema = z
  .object({
    system: z.string().min(1).max(100),
    type: SourceNoteTypeSchema,
    number: z.string().min(1).max(100),
    revision: z.number().int().nonnegative().default(1),
  })
  .strict();
export type SourceNoteRef = z.infer<typeof SourceNoteRefSchema>;

export const OrderRefSchema = z
  .object({
    system: z.string().min(1).max(100),
    number: z.string().min(1).max(100),
  })
  .strict();
export type OrderRef = z.infer<typeof OrderRefSchema>;

// ─── Cargo ──────────────────────────────────────────────────────────────────

export const PromisedLineSchema = z
  .object({
    lineId: z.string().max(40),
    sku: z.string().min(1).max(200),
    description: z.string().min(1).max(2000),
    quantity: z.number().positive(),
    uom: UnitOfMeasureSchema,
    sourceLineRef: z.string().max(200).optional(),
    metadata: MetadataSchema.default({}),
  })
  .strict();
export type PromisedLine = z.infer<typeof PromisedLineSchema>;

export const ParcelSchema = z
  .object({
    parcelId: z.string().max(40),
    type: ParcelTypeSchema,
    label: z.string().max(200).optional(),
    weightGrams: z.number().int().positive(),
    lengthMm: z.number().int().positive().optional(),
    widthMm: z.number().int().positive().optional(),
    heightMm: z.number().int().positive().optional(),
    volumeCm3: z.number().int().positive().optional(),
    lineRefs: z.array(z.string().max(40)).default([]),
    status: ParcelStatusSchema.default('packed'),
    metadata: MetadataSchema.default({}),
  })
  .strict();
export type Parcel = z.infer<typeof ParcelSchema>;

// ─── Drafts — used in inbound commands where IDs are generated server-side ──

export const PromisedLineDraftSchema = PromisedLineSchema.extend({
  lineId: z.string().max(40).optional(),
});
export type PromisedLineDraft = z.infer<typeof PromisedLineDraftSchema>;

export const ParcelDraftSchema = ParcelSchema.extend({
  parcelId: z.string().max(40).optional(),
});
export type ParcelDraft = z.infer<typeof ParcelDraftSchema>;
