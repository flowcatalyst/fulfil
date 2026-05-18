import { Type } from '@sinclair/typebox';

/**
 * Event-type schema for `fulfil.lastmile.fulfilment.awaiting-geocoding`.
 * Emitted by the fulfilment reactor when one or both location ends lack
 * geocoded coordinates and shipment creation is parked.
 */
export const LastMileFulfilmentAwaitingGeocodingEventDataSchema = Type.Object(
  {
    fulfilmentId: Type.String(),
    tenantId: Type.String(),
    missingLegs: Type.Array(
      Type.Union([Type.Literal('collection'), Type.Literal('dropOff')]),
    ),
  },
  {
    $id: 'fulfil.lastmile.fulfilment.awaiting-geocoding.v1',
    additionalProperties: false,
    description:
      'Data payload for the LastMileFulfilmentAwaitingGeocoding domain event. Client-specific geocoding orchestrators subscribe to this to drive their workflow.',
  },
);
