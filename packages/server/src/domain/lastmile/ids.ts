/**
 * Branded ID types for the LastMile subdomain. The brand is compile-time only;
 * runtime values are plain strings. Format is `<prefix>_<13-char-tsid>` — 17
 * chars total — matching `tsidColumn(...)` in `infrastructure/schema/common.ts`.
 */

export type TenantId = string & { readonly __brand: 'TenantId' };
export type LastMileFulfilmentId = string & {
  readonly __brand: 'LastMileFulfilmentId';
};
export type PromisedLineId = string & { readonly __brand: 'PromisedLineId' };
export type ParcelId = string & { readonly __brand: 'ParcelId' };
export type ShipmentId = string & { readonly __brand: 'ShipmentId' };
export type LocationId = string & { readonly __brand: 'LocationId' };
export type CourierId = string & { readonly __brand: 'CourierId' };
export type VehicleId = string & { readonly __brand: 'VehicleId' };

// Prefixes. Registered with the AggregateRegistry's prefixMap so the registry
// can resolve aggregate type from the id without tagAggregate wrapping.
export const LAST_MILE_FULFILMENT_ID_PREFIX = 'lmf' as const;
export const PROMISED_LINE_ID_PREFIX = 'pln' as const;
export const PARCEL_ID_PREFIX = 'par' as const;
export const SHIPMENT_ID_PREFIX = 'shp' as const;

export function asTenantId(value: string): TenantId {
  return value as TenantId;
}
export function asLastMileFulfilmentId(value: string): LastMileFulfilmentId {
  return value as LastMileFulfilmentId;
}
export function asPromisedLineId(value: string): PromisedLineId {
  return value as PromisedLineId;
}
export function asParcelId(value: string): ParcelId {
  return value as ParcelId;
}
export function asShipmentId(value: string): ShipmentId {
  return value as ShipmentId;
}
