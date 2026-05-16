import { Type } from '@sinclair/typebox';
import { ShipmentStatusSchema } from '../common.js';

/**
 * Event-type schema for `fulfil.lastmile.fulfilment.shipment-linked`.
 * Emitted when the reactor appends a new shipment to a fulfilment's
 * `linkedShipments` array.
 */
export const LastMileFulfilmentShipmentLinkedEventDataSchema = Type.Object(
  {
    fulfilmentId: Type.String(),
    tenantId: Type.String(),
    shipmentId: Type.String(),
    shipmentStatus: ShipmentStatusSchema,
    linkedShipmentCount: Type.Integer({ minimum: 1 }),
  },
  {
    $id: 'fulfil.lastmile.fulfilment.shipment-linked.v1',
    additionalProperties: false,
    description:
      'Data payload for the LastMileFulfilmentShipmentLinked domain event. Records the fulfilment-side append of a child shipment after the shipment-created reactor fires.',
  },
);
