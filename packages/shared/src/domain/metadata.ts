import { z } from 'zod';

/**
 * Opaque passthrough data attached to operational aggregates.
 *
 * Fulfil never reads or interprets metadata for behaviour, routing, rules, or
 * display semantics. The only processing performed is schema + limits
 * enforcement (below). Anything Fulfil needs to interpret is a first-class
 * domain field, never metadata.
 *
 * Any edge-side behaviour a caller drives from metadata values — routing,
 * dashboarding, automations — is entirely the caller's responsibility to
 * maintain. Fulfil makes no guarantees about metadata semantic stability.
 */
export type Metadata = Record<string, string>;

export const MetadataLimits = {
  maxEntries: 50,
  maxKeyLength: 64,
  maxValueLength: 2048,
  keyPattern: /^[a-zA-Z0-9_.:-]+$/,
} as const;

export const MetadataSchema = z
  .record(
    z
      .string()
      .min(1)
      .max(MetadataLimits.maxKeyLength)
      .regex(MetadataLimits.keyPattern),
    z.string().max(MetadataLimits.maxValueLength),
  )
  .refine((m) => Object.keys(m).length <= MetadataLimits.maxEntries, {
    message: `metadata cannot exceed ${MetadataLimits.maxEntries} entries`,
  });
