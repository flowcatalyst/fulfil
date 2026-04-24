import { Type } from '@sinclair/typebox';
import {
  HandlingFlagSchema,
  MetadataSchema,
  TemperatureZoneSchema,
} from '../common.js';
import {
  CollectionPointSchema,
  ConsigneeSchema,
  DropOffPointSchema,
  OrderRefSchema,
  PromisedWindowSchema,
  SourceNoteRefSchema,
} from '../value-objects.js';

/**
 * Event-type schema for `fulfil.lastmile.fulfilment.created`. Documents the
 * `data` payload carried on the CloudEvents envelope. Registered with the
 * OpenAPI schema registry and (future) the FlowCatalyst event-type registry
 * for cross-service discovery.
 */
export const LastMileFulfilmentCreatedEventDataSchema = Type.Object(
  {
    fulfilmentId: Type.String({
      description: 'TSID of the fulfilment aggregate (prefixed lmf_).',
    }),
    tenantId: Type.String({ description: 'Tenant that owns this fulfilment.' }),
    sourceNote: SourceNoteRefSchema,
    orderRef: Type.Union([OrderRefSchema, Type.Null()]),
    collection: CollectionPointSchema,
    dropOff: DropOffPointSchema,
    consignee: ConsigneeSchema,
    promisedWindow: PromisedWindowSchema,
    lineCount: Type.Integer({ minimum: 0 }),
    parcelCount: Type.Integer({ minimum: 0 }),
    temperatureZone: TemperatureZoneSchema,
    handling: Type.Array(HandlingFlagSchema),
    metadata: MetadataSchema,
  },
  {
    $id: 'fulfil.lastmile.fulfilment.created.v1',
    additionalProperties: false,
    description:
      'Data payload for the LastMileFulfilmentCreated domain event. Emitted to the outbox when a new fulfilment enters `awaiting_planning`.',
  },
);
