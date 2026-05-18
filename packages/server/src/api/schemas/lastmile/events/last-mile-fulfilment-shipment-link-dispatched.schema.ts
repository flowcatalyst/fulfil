import { Type } from '@sinclair/typebox';

/**
 * Event-type schema for `fulfil.lastmile.fulfilment.shipment-link-dispatched`.
 * Audit trail recorded by the LastMile process when it observes a
 * shipment-created event and emits a dispatch job to link the shipment
 * back onto its parent fulfilment.
 */
export const LastMileFulfilmentShipmentLinkDispatchedEventDataSchema = Type.Object(
  {
    fulfilmentId: Type.String(),
    tenantId: Type.String(),
    shipmentId: Type.String(),
    dispatchJobId: Type.String(),
    targetUrl: Type.String({ format: 'uri' }),
  },
  {
    $id: 'fulfil.lastmile.fulfilment.shipment-link-dispatched.v1',
    additionalProperties: false,
    description:
      'Data payload for the LastMileFulfilmentShipmentLinkDispatched audit event.',
  },
);
