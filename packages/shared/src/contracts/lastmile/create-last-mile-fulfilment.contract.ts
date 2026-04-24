import { z } from 'zod';
import { MetadataSchema } from '../../domain/metadata.js';
import {
  CollectionPointSchema,
  ConsigneeSchema,
  DropOffPointSchema,
  HandlingFlagSchema,
  OrderRefSchema,
  ParcelDraftSchema,
  PromisedLineDraftSchema,
  PromisedWindowSchema,
  SourceNoteRefSchema,
  TemperatureZone,
  TemperatureZoneSchema,
} from '../../domain/lastmile/index.js';

/**
 * API-edge contract for creating a LastMileFulfilment.
 *
 * Callers submit fully-populated value objects. The server does not hydrate
 * master data (locations, couriers, vehicles, product catalog). Any
 * master-data lookup happens in the caller — UI form, controller-layer
 * helper, or integration adapter — before the command is dispatched.
 */
export const CreateLastMileFulfilmentCommandSchema = z
  .object({
    sourceNote: SourceNoteRefSchema,
    orderRef: OrderRefSchema.optional(),

    collection: CollectionPointSchema,
    dropOff: DropOffPointSchema,
    consignee: ConsigneeSchema,
    promisedWindow: PromisedWindowSchema,

    lines: z.array(PromisedLineDraftSchema).optional(),
    parcels: z.array(ParcelDraftSchema).optional(),

    temperatureZone: TemperatureZoneSchema.default(TemperatureZone.Ambient),
    handling: z.array(HandlingFlagSchema).default([]),

    metadata: MetadataSchema.default({}),
  })
  .strict();

export type CreateLastMileFulfilmentCommand = z.infer<
  typeof CreateLastMileFulfilmentCommandSchema
>;
