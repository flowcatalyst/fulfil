import { z } from 'zod';

/**
 * Command for transitioning a shipment from `unfinalised` → `ready` once
 * goods-availability is confirmed (typically by warehouse/packing).
 *
 * `note` is an optional free-text record carried on the resulting domain
 * event for audit / handover context. Not interpreted by Fulfil.
 */
export const MarkShipmentReadyCommandSchema = z
  .object({
    shipmentId: z.string().min(1).max(40),
    note: z.string().max(2000).optional(),
  })
  .strict();

export type MarkShipmentReadyCommand = z.infer<
  typeof MarkShipmentReadyCommandSchema
>;
