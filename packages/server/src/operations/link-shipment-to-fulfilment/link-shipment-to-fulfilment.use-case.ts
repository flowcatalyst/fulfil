import { Effect } from 'effect';
import {
  BusinessRuleViolation,
  ScopeStore,
  ValidationError,
  type Sealed,
  type UnitOfWork,
  type UseCaseError,
} from '@fulfil/framework';

import {
  AggregateRegistry,
  commitAggregate,
} from '../../infrastructure/unit-of-work.js';
import {
  asLastMileFulfilmentId,
  asParcelId,
  asPromisedLineId,
  asShipmentId,
  asTenantId,
} from '../../domain/lastmile/ids.js';
import { LastMileFulfilment } from '../../domain/lastmile/last-mile-fulfilment.js';
import type { LastMileFulfilmentRepository } from '../../domain/lastmile/last-mile-fulfilment.repository.js';
import type { LastMileShipmentRepository } from '../../domain/lastmile/last-mile-shipment.repository.js';
import type { LinkedShipment } from '../../domain/lastmile/state.js';
import { LastMileFulfilmentShipmentLinked } from '../../domain/lastmile/events/last-mile-fulfilment-shipment-linked.event.js';

import type { LinkShipmentToFulfilmentInput } from './link-shipment-to-fulfilment.command.js';

/**
 * Append a shipment to its parent fulfilment's `linkedShipments` and clear
 * the fulfilment's `reaction.awaitingEventType`.
 *
 * Dispatch-target use case — invoked by the LastMile process when it
 * observes `LastMileShipmentCreated`. The process emits a dispatch job
 * here so the link work is independently retryable from anything else the
 * process does (process-pattern rule: cross-aggregate work goes via
 * dispatch).
 *
 * Idempotency: `LastMileFulfilment.isShipmentLinked` short-circuits with a
 * `SHIPMENT_ALREADY_LINKED` business-rule violation that the route handler
 * maps to HTTP 200 `skipped_duplicate` (so FlowCatalyst doesn't retry).
 */
export class LinkShipmentToFulfilmentUseCase {
  constructor(
    private readonly fulfilments: LastMileFulfilmentRepository,
    private readonly shipments: LastMileShipmentRepository,
  ) {}

  execute = (
    input: LinkShipmentToFulfilmentInput,
  ): Effect.Effect<
    Sealed<LastMileFulfilmentShipmentLinked>,
    UseCaseError,
    UnitOfWork | AggregateRegistry
  > => {
    const fulfilments = this.fulfilments;
    const shipments = this.shipments;

    return Effect.gen(function* () {
      const scope = ScopeStore.require();

      // 1. Tenant guard.
      if (!scope.tenant || scope.tenant.tenantId !== input.tenantId) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'TENANT_MISMATCH',
            message: `Scope tenant ${scope.tenant?.tenantId ?? '(none)'} does not match input tenant ${input.tenantId}.`,
          }),
        );
      }
      const tenantId = asTenantId(input.tenantId);
      const shipmentId = asShipmentId(input.shipmentId);
      const fulfilmentId = asLastMileFulfilmentId(input.fulfilmentId);

      // 2. Load the shipment (source of truth for parcel/line IDs + status).
      const shipment = yield* Effect.tryPromise({
        try: () => shipments.findById(tenantId, shipmentId),
        catch: (cause) =>
          new BusinessRuleViolation({
            code: 'REPO_READ_FAILED',
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      });
      if (!shipment) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'SHIPMENT_NOT_FOUND',
            message: `Shipment ${input.shipmentId} not found in tenant ${input.tenantId}.`,
          }),
        );
      }

      // 3. Validate the URL fulfilmentId matches the shipment's parent.
      if (shipment.fulfilmentId !== fulfilmentId) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'FULFILMENT_MISMATCH',
            message: `Shipment ${input.shipmentId} belongs to fulfilment ${shipment.fulfilmentId}, not ${input.fulfilmentId}.`,
          }),
        );
      }

      // 4. Load the parent fulfilment.
      const fulfilment = yield* Effect.tryPromise({
        try: () => fulfilments.findById(tenantId, fulfilmentId),
        catch: (cause) =>
          new BusinessRuleViolation({
            code: 'REPO_READ_FAILED',
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      });
      if (!fulfilment) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'FULFILMENT_NOT_FOUND',
            message: `Fulfilment ${input.fulfilmentId} not found in tenant ${input.tenantId}.`,
          }),
        );
      }

      // 5. Idempotency — already linked → benign duplicate.
      if (LastMileFulfilment.isShipmentLinked(fulfilment, shipmentId)) {
        return yield* Effect.fail(
          new BusinessRuleViolation({
            code: 'SHIPMENT_ALREADY_LINKED',
            message: `Shipment ${input.shipmentId} is already linked to fulfilment ${fulfilment.id}.`,
            details: { fulfilmentId: fulfilment.id, shipmentId: shipment.id },
          }),
        );
      }

      // 6. Build the LinkedShipment + updated aggregate + event.
      const now = new Date();
      const linkedShipment: LinkedShipment = {
        shipmentId: shipment.id,
        parcelIds: shipment.parcels.map((p) => asParcelId(p.parcelId)),
        lineIds: shipment.lines.map((l) => asPromisedLineId(l.lineId)),
        status: shipment.status,
        outcome: null,
        linkedAt: now,
      };
      const updated = LastMileFulfilment.linkShipment(
        fulfilment,
        linkedShipment,
        input.handledEventId ?? scope.executionId,
        now,
      );

      const event = new LastMileFulfilmentShipmentLinked(scope, {
        fulfilmentId: updated.id,
        tenantId: updated.tenantId,
        shipmentId: shipment.id,
        shipmentStatus: shipment.status,
        linkedShipmentCount: updated.linkedShipments.length,
      });

      return yield* commitAggregate(updated, event, input);
    });
  };
}
