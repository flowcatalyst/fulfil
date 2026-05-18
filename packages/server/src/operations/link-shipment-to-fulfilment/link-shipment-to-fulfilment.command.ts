export { LinkShipmentToFulfilmentCommandSchema } from '@fulfil/shared';
export type { LinkShipmentToFulfilmentCommand } from '@fulfil/shared';

/**
 * Use-case input shape — includes the fulfilmentId from the URL path
 * alongside the body fields, so the handler doesn't need to read the
 * Fastify request directly.
 */
export interface LinkShipmentToFulfilmentInput {
  readonly fulfilmentId: string;
  readonly shipmentId: string;
  readonly tenantId: string;
  readonly handledEventId?: string;
}
