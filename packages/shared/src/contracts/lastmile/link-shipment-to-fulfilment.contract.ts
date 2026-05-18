import { z } from 'zod';

/**
 * Command for the fulfilment-side "link shipment" action.
 *
 * Dispatched from the LastMile process when it observes a
 * `LastMileShipmentCreated` event: the process emits a dispatch job that
 * targets `POST /fulfilments/:id/link-shipment` with this payload. The
 * receiving use case loads both aggregates and appends the linked shipment
 * to the fulfilment, clearing its reaction bookkeeping.
 *
 * `fulfilmentId` rides the URL path; this contract carries only the
 * shipment side + tenant for the use case to load.
 */
export const LinkShipmentToFulfilmentCommandSchema = z
  .object({
    shipmentId: z.string().min(1).max(40),
    tenantId: z.string().min(1).max(100),
    /** Originating event ID — recorded on `fulfilment.reaction.lastHandledEventId` for replay idempotency. */
    handledEventId: z.string().min(1).max(40).optional(),
  })
  .strict();

export type LinkShipmentToFulfilmentCommand = z.infer<
  typeof LinkShipmentToFulfilmentCommandSchema
>;
