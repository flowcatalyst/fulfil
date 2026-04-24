import type {
  CollectionPoint,
  Consignee,
  DropOffPoint,
  HandlingFlag,
  Metadata,
  OrderRef,
  Parcel,
  PromisedLine,
  PromisedWindow,
  SourceNoteRef,
  TemperatureZone,
} from '@fulfil/shared';
import type { LastMileFulfilmentId, TenantId } from './ids.js';
import type {
  FulfilmentStatePayload,
  LinkedShipment,
  ReactionBookkeeping,
} from './state.js';

/**
 * LastMileFulfilment — the PM aggregate representing one source-note obligation.
 *
 * Owns: the upstream commitment, the logistics parties (collection, drop-off,
 * consignee), the promised window, cargo (lines pre-pack / parcels post-pack),
 * the cargo profile, the fulfilment stage, and PM reaction bookkeeping.
 *
 * Does NOT own: courier assignment, routing, vehicle selection — those belong
 * to the Shipment aggregate the planner spawns off this fulfilment.
 *
 * Plain-object aggregate (no classes-for-data). Behaviour lives on the
 * `LastMileFulfilment` namespace below.
 */
export interface LastMileFulfilment {
  readonly id: LastMileFulfilmentId;
  readonly tenantId: TenantId;

  readonly sourceNote: SourceNoteRef;
  readonly orderRef: OrderRef | null;

  readonly collection: CollectionPoint;
  readonly dropOff: DropOffPoint;
  readonly consignee: Consignee;
  readonly promisedWindow: PromisedWindow;

  // Both optional at creation — may be populated via later declaration events.
  readonly lines: readonly PromisedLine[];
  readonly parcels: readonly Parcel[];

  // Cargo profile. One temperature zone per fulfilment; planner splits if the
  // source obligation needs mixed zones.
  readonly temperatureZone: TemperatureZone;
  readonly handling: readonly HandlingFlag[];

  // PM linkage to shipments spawned from this fulfilment.
  readonly linkedShipments: readonly LinkedShipment[];

  // State machine + PM bookkeeping.
  readonly state: FulfilmentStatePayload;
  readonly reaction: ReactionBookkeeping;

  // Opaque passthrough from upstream — Fulfil never interprets this.
  readonly metadata: Metadata;

  // Optimistic concurrency.
  readonly version: number;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LastMileFulfilmentCreateInput {
  readonly id: LastMileFulfilmentId;
  readonly tenantId: TenantId;
  readonly sourceNote: SourceNoteRef;
  readonly orderRef: OrderRef | null;
  readonly collection: CollectionPoint;
  readonly dropOff: DropOffPoint;
  readonly consignee: Consignee;
  readonly promisedWindow: PromisedWindow;
  readonly lines: readonly PromisedLine[];
  readonly parcels: readonly Parcel[];
  readonly temperatureZone: TemperatureZone;
  readonly handling: readonly HandlingFlag[];
  readonly metadata: Metadata;
  readonly now: Date;
}

// Registered with the AggregateRegistry; used to resolve the correct repository
// when the UoW persists this aggregate type.
export const LAST_MILE_FULFILMENT_TYPE = 'LastMileFulfilment' as const;

export const LastMileFulfilment = {
  typeName: LAST_MILE_FULFILMENT_TYPE,

  /**
   * Construct a brand-new fulfilment in `awaiting_planning`. Does not validate
   * — the Create use case performs business-rule validation before calling.
   */
  create(input: LastMileFulfilmentCreateInput): LastMileFulfilment {
    return {
      id: input.id,
      tenantId: input.tenantId,
      sourceNote: input.sourceNote,
      orderRef: input.orderRef,
      collection: input.collection,
      dropOff: input.dropOff,
      consignee: input.consignee,
      promisedWindow: input.promisedWindow,
      lines: input.lines,
      parcels: input.parcels,
      temperatureZone: input.temperatureZone,
      handling: input.handling,
      linkedShipments: [],
      state: { stage: 'awaiting_planning' },
      reaction: {
        awaitingEventType: null,
        awaitingDeadline: null,
        lastHandledEventId: null,
        lastReactionAt: null,
      },
      metadata: input.metadata,
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    };
  },
} as const;
