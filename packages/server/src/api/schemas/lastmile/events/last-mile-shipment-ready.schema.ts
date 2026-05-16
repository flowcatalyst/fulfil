import { Type } from '@sinclair/typebox';

/**
 * Event-type schema for `fulfil.lastmile.shipment.ready`. Emitted on
 * `unfinalised → ready` transition once goods-availability is confirmed.
 */
export const LastMileShipmentReadyEventDataSchema = Type.Object(
  {
    shipmentId: Type.String(),
    tenantId: Type.String(),
    fulfilmentId: Type.String(),
    note: Type.Union([Type.String(), Type.Null()]),
  },
  {
    $id: 'fulfil.lastmile.shipment.ready.v1',
    additionalProperties: false,
    description:
      'Data payload for the LastMileShipmentReady domain event. Emitted when goods are confirmed packed and the shipment is eligible for planning onto a trip.',
  },
);
