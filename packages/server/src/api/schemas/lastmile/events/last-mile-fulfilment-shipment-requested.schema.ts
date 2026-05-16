import { Type } from '@sinclair/typebox';

/**
 * Event-type schema for `fulfil.lastmile.fulfilment.shipment-requested`.
 * Emitted by the fulfilment reactor when it dispatches a shipment-creation job.
 */
export const LastMileFulfilmentShipmentRequestedEventDataSchema = Type.Object(
  {
    fulfilmentId: Type.String(),
    tenantId: Type.String(),
    dispatchJobId: Type.String(),
    targetUrl: Type.String({ format: 'uri' }),
  },
  {
    $id: 'fulfil.lastmile.fulfilment.shipment-requested.v1',
    additionalProperties: false,
    description:
      'Data payload for the LastMileFulfilmentShipmentRequested domain event. Emitted by the fulfilment reactor alongside the dispatch job that triggers `CreateLastMileShipment`.',
  },
);
