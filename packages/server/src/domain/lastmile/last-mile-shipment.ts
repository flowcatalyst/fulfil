import type {
  CollectionPoint,
  Consignee,
  DropOffPoint,
  HandlingFlag,
  Metadata,
  Parcel,
  PromisedLine,
  PromisedWindow,
  ShipmentStatus,
  TemperatureZone,
} from '@fulfil/shared';
import { ShipmentStatus as ShipmentStatusCatalog } from '@fulfil/shared';
import type {
  LastMileFulfilmentId,
  ShipmentId,
  TenantId,
  TripId,
} from './ids.js';

/**
 * LastMileShipment — the transport unit derived from a `LastMileFulfilment`.
 *
 * Owns: the cargo to transport (lines + parcels, denormalised from the
 * fulfilment at creation so shipment doesn't shift if upstream cargo changes),
 * collection / drop-off / consignee value objects (geocoded copies), the
 * promised window, optional trip linkage, and its own status lifecycle.
 *
 * Does NOT own: the upstream commitment (fulfilment owns the source note +
 * uniqueness invariant), the trip itself (Trip is a separate aggregate that
 * carries the courier, vehicle, route, and may hold multiple shipments),
 * delivery proof (carried on shipment events, not the aggregate row).
 *
 * Lifecycle: born `unfinalised` from a fulfilment via the reactor. Moves to
 * `ready` once goods-availability is confirmed (separate use case). Moves to
 * `planned` when assigned to a trip. Then `in_transit` → `delivered` /
 * `failed` / `returned` (or `cancelled` before transport).
 */
export interface LastMileShipment {
  readonly id: ShipmentId;
  readonly tenantId: TenantId;
  readonly fulfilmentId: LastMileFulfilmentId;

  readonly collection: CollectionPoint;
  readonly dropOff: DropOffPoint;
  readonly consignee: Consignee;
  readonly promisedWindow: PromisedWindow;

  // v1: cargo carries the fulfilment's whole cargo. A future SplitShipment use
  // case will split lines/parcels across multiple shipments per fulfilment.
  readonly lines: readonly PromisedLine[];
  readonly parcels: readonly Parcel[];

  readonly temperatureZone: TemperatureZone;
  readonly handling: readonly HandlingFlag[];

  // Trip assignment — null until the planner attaches the shipment to a Trip
  // aggregate. The shipment never owns the courier/vehicle; those live on Trip.
  readonly trip: { readonly tripId: TripId } | null;

  readonly status: ShipmentStatus;

  // Opaque passthrough — propagated from the parent fulfilment + any reactor
  // additions. Fulfil never reads this for behaviour.
  readonly metadata: Metadata;

  // Optimistic concurrency.
  readonly version: number;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LastMileShipmentCreateInput {
  readonly id: ShipmentId;
  readonly tenantId: TenantId;
  readonly fulfilmentId: LastMileFulfilmentId;
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

// Registered with the AggregateRegistry; used to resolve the correct
// repository when UoW persists this aggregate type.
export const LAST_MILE_SHIPMENT_TYPE = 'LastMileShipment' as const;

export const LastMileShipment = {
  typeName: LAST_MILE_SHIPMENT_TYPE,

  /** Construct a brand-new shipment in `unfinalised`. */
  create(input: LastMileShipmentCreateInput): LastMileShipment {
    return {
      id: input.id,
      tenantId: input.tenantId,
      fulfilmentId: input.fulfilmentId,
      collection: input.collection,
      dropOff: input.dropOff,
      consignee: input.consignee,
      promisedWindow: input.promisedWindow,
      lines: input.lines,
      parcels: input.parcels,
      temperatureZone: input.temperatureZone,
      handling: input.handling,
      trip: null,
      status: ShipmentStatusCatalog.Unfinalised,
      metadata: input.metadata,
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    };
  },

  /**
   * Transition `unfinalised → ready` once goods-availability is confirmed.
   *
   * Caller (the use case) validates the precondition that `status` is
   * `unfinalised`; this helper just produces the next state.
   */
  markReady(shipment: LastMileShipment, now: Date): LastMileShipment {
    return {
      ...shipment,
      status: ShipmentStatusCatalog.Ready,
      version: shipment.version + 1,
      updatedAt: now,
    };
  },
} as const;
