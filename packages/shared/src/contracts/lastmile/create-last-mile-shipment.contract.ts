import { z } from 'zod';
import { MetadataSchema } from '../../domain/metadata.js';
import {
  CollectionPointSchema,
  ConsigneeSchema,
  DropOffPointSchema,
  HandlingFlagSchema,
  ParcelSchema,
  PromisedLineSchema,
  PromisedWindowSchema,
  TemperatureZone,
  TemperatureZoneSchema,
} from '../../domain/lastmile/index.js';

/**
 * Command for creating a `LastMileShipment` from a fulfilment.
 *
 * Issued by the fulfilment reactor via a dispatch job. The reactor copies
 * the fulfilment's cargo + locations + consignee + window into the command
 * — the shipment owns its own snapshot from here on (subsequent fulfilment
 * edits don't drift this shipment).
 *
 * `lineId` and `parcelId` are required (not draft variants): the fulfilment
 * has already generated them, and the shipment carries them through to the
 * trip planner / driver app.
 */
export const CreateLastMileShipmentCommandSchema = z
  .object({
    tenantId: z.string().min(1).max(100),
    fulfilmentId: z.string().min(1).max(40),

    collection: CollectionPointSchema,
    dropOff: DropOffPointSchema,
    consignee: ConsigneeSchema,
    promisedWindow: PromisedWindowSchema,

    lines: z.array(PromisedLineSchema).default([]),
    parcels: z.array(ParcelSchema).default([]),

    temperatureZone: TemperatureZoneSchema.default(TemperatureZone.Ambient),
    handling: z.array(HandlingFlagSchema).default([]),

    metadata: MetadataSchema.default({}),
  })
  .strict();

export type CreateLastMileShipmentCommand = z.infer<
  typeof CreateLastMileShipmentCommandSchema
>;
