import type { ParcelId, PromisedLineId, ShipmentId } from './ids.js';

/**
 * LastMileFulfilment's view of a shipment it has spawned (during planning)
 * or been linked to. Value object shaped for the PM's rollup logic — courier,
 * vehicle, and route belong to the Shipment aggregate, not here.
 */
export interface LinkedShipment {
  readonly shipmentId: ShipmentId;
  readonly parcelIds: readonly ParcelId[];
  readonly lineIds: readonly PromisedLineId[];
  // Last known shipment status, updated via shipment-level events.
  // TODO: once Shipment aggregate exists, narrow to the ShipmentStatus catalog.
  readonly status: string;
  readonly outcome: 'delivered' | 'failed' | 'partial' | null;
  readonly linkedAt: Date;
}

/**
 * Process-manager bookkeeping.
 *
 * - `awaitingEventType` — the fully-qualified event type the PM is next
 *   expecting (e.g. `fulfil.lastmile.shipment.delivered`). `null` when idle.
 * - `awaitingDeadline` — timer; when elapsed a sweeper emits `DeadlineElapsed`.
 * - `lastHandledEventId` — idempotency against redelivered inbound events.
 * - `lastReactionAt` — when the PM last advanced state.
 */
export interface ReactionBookkeeping {
  readonly awaitingEventType: string | null;
  readonly awaitingDeadline: Date | null;
  readonly lastHandledEventId: string | null;
  readonly lastReactionAt: Date | null;
}

/**
 * Stage-specific state carried on the aggregate. Discriminated by `stage`.
 *
 * The Drizzle row denormalises the `stage` field into a top-level column for
 * indexing; `statePayload` stores this whole object as JSONB so the stage-
 * specific fields travel together.
 *
 * Note: Date fields inside JSONB serialise to ISO strings on write and come
 * back as strings on read. `toAggregate()` in the repository revives them.
 */
export type FulfilmentStatePayload =
  | { readonly stage: 'awaiting_planning' }
  | { readonly stage: 'planned'; readonly plannedAt: Date }
  | { readonly stage: 'in_progress'; readonly startedAt: Date }
  | { readonly stage: 'delivered'; readonly deliveredAt: Date }
  | {
      readonly stage: 'partially_delivered';
      readonly completedAt: Date;
      readonly successfulShipmentIds: readonly ShipmentId[];
      readonly failedShipmentIds: readonly ShipmentId[];
    }
  | {
      readonly stage: 'completed_with_exceptions';
      readonly resolvedAt: Date;
      readonly summary: string;
    }
  | {
      readonly stage: 'failed';
      readonly failedAt: Date;
      readonly reason: string;
    }
  | {
      readonly stage: 'cancelled';
      readonly cancelledAt: Date;
      readonly cancelledBy: string;
      readonly reason: string;
    }
  | {
      readonly stage: 'escalated';
      readonly escalatedAt: Date;
      readonly exception: { readonly code: string; readonly message: string };
    }
  | {
      readonly stage: 'abandoned';
      readonly abandonedAt: Date;
      readonly reason: string;
    };
