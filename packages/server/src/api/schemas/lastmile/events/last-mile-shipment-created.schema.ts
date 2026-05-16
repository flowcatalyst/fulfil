import { Type } from '@sinclair/typebox';
import {
  HandlingFlagSchema,
  MetadataSchema,
  ShipmentStatusSchema,
  TemperatureZoneSchema,
} from '../common.js';
import {
  CollectionPointSchema,
  ConsigneeSchema,
  DropOffPointSchema,
  PromisedWindowSchema,
} from '../value-objects.js';

/**
 * Event-type schema for `fulfil.lastmile.shipment.created`. Documents the
 * `data` payload carried on the CloudEvents envelope.
 */
export const LastMileShipmentCreatedEventDataSchema = Type.Object(
  {
    shipmentId: Type.String({
      description: 'TSID of the shipment aggregate (prefixed shp_).',
    }),
    tenantId: Type.String({ description: 'Tenant that owns this shipment.' }),
    fulfilmentId: Type.String({
      description: 'TSID of the parent fulfilment (prefixed lmf_).',
    }),
    collection: CollectionPointSchema,
    dropOff: DropOffPointSchema,
    consignee: ConsigneeSchema,
    promisedWindow: PromisedWindowSchema,
    lineCount: Type.Integer({ minimum: 0 }),
    parcelCount: Type.Integer({ minimum: 0 }),
    temperatureZone: TemperatureZoneSchema,
    handling: Type.Array(HandlingFlagSchema),
    status: ShipmentStatusSchema,
    metadata: MetadataSchema,
  },
  {
    $id: 'fulfil.lastmile.shipment.created.v1',
    additionalProperties: false,
    description:
      'Data payload for the LastMileShipmentCreated domain event. Emitted to the outbox when the reactor spawns a new shipment from a fulfilment.',
  },
);
