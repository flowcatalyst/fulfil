import { z } from 'zod';

// Upstream source document types — tenants may use different documents to
// trigger fulfilment (delivery note, invoice, pick list, sales order, etc.).
export const SourceNoteType = {
  DeliveryNote: 'delivery_note',
  Invoice: 'invoice',
  ProForma: 'pro_forma_invoice',
  PickList: 'pick_list',
  SalesOrder: 'sales_order',
  DispatchAdvice: 'dispatch_advice',
} as const;
export type SourceNoteType =
  (typeof SourceNoteType)[keyof typeof SourceNoteType];
export const SourceNoteTypeSchema = z.nativeEnum(SourceNoteType);

// A fulfilment occupies ONE thermal zone. Mixed-temperature fulfilments are
// split by the planner into multiple shipments, one per zone.
export const TemperatureZone = {
  Ambient: 'ambient',
  Chilled: 'chilled',
  Frozen: 'frozen',
  DeepFrozen: 'deep_frozen',
} as const;
export type TemperatureZone =
  (typeof TemperatureZone)[keyof typeof TemperatureZone];
export const TemperatureZoneSchema = z.nativeEnum(TemperatureZone);

// Independent flags — any combination may be set on a fulfilment/shipment.
export const HandlingFlag = {
  Fragile: 'fragile',
  Hazardous: 'hazardous',
  HighValue: 'high_value',
  Oversize: 'oversize',
  LiquidUprightOnly: 'liquid_upright',
  AgeVerify: 'age_verify',
  SignatureRequired: 'signature_required',
  Contactless: 'contactless',
  IdVerify: 'id_verify',
  KeepDry: 'keep_dry',
} as const;
export type HandlingFlag = (typeof HandlingFlag)[keyof typeof HandlingFlag];
export const HandlingFlagSchema = z.nativeEnum(HandlingFlag);

export const ParcelType = {
  Box: 'box',
  Bag: 'bag',
  Envelope: 'envelope',
  Tube: 'tube',
  Pallet: 'pallet',
  Crate: 'crate',
  Cooler: 'cooler',
  DangerousGoods: 'dangerous_goods',
  Other: 'other',
} as const;
export type ParcelType = (typeof ParcelType)[keyof typeof ParcelType];
export const ParcelTypeSchema = z.nativeEnum(ParcelType);

export const ParcelStatus = {
  Packed: 'packed',
  PickedUp: 'picked_up',
  Delivered: 'delivered',
  Failed: 'failed',
  Returned: 'returned',
} as const;
export type ParcelStatus = (typeof ParcelStatus)[keyof typeof ParcelStatus];
export const ParcelStatusSchema = z.nativeEnum(ParcelStatus);

export const UnitOfMeasure = {
  Each: 'each',
  Kilogram: 'kg',
  Gram: 'g',
  Litre: 'l',
  Millilitre: 'ml',
  Metre: 'm',
  Case: 'case',
  Pallet: 'pallet',
} as const;
export type UnitOfMeasure = (typeof UnitOfMeasure)[keyof typeof UnitOfMeasure];
export const UnitOfMeasureSchema = z.nativeEnum(UnitOfMeasure);

export const FailureReason = {
  RecipientAbsent: 'recipient_absent',
  Refused: 'refused',
  AddressInvalid: 'address_invalid',
  AccessBlocked: 'access_blocked',
  Damaged: 'damaged',
  CourierIncident: 'courier_incident',
  TemperatureBreach: 'temperature_breach',
  Other: 'other',
} as const;
export type FailureReason = (typeof FailureReason)[keyof typeof FailureReason];
export const FailureReasonSchema = z.nativeEnum(FailureReason);

// Fulfilment lifecycle stages. First-pass Create use case enters
// `awaiting_planning`; other stages are reached via downstream use cases
// (planning, shipment roll-up reactions, cancel/abort, etc.).
export const LastMileStage = {
  AwaitingPlanning: 'awaiting_planning',
  Planned: 'planned',
  InProgress: 'in_progress',
  Delivered: 'delivered',
  PartiallyDelivered: 'partially_delivered',
  CompletedWithExceptions: 'completed_with_exceptions',
  Failed: 'failed',
  Cancelled: 'cancelled',
  Escalated: 'escalated',
  Abandoned: 'abandoned',
} as const;
export type LastMileStage = (typeof LastMileStage)[keyof typeof LastMileStage];
export const LastMileStageSchema = z.nativeEnum(LastMileStage);
