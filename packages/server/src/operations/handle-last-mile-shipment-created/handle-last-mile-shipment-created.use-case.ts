import { Effect } from 'effect';
import {
  BusinessRuleViolation,
  ScopeStore,
  UnitOfWork,
  ValidationError,
  type Sealed,
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

import type { HandleLastMileShipmentCreatedInput } from './handle-last-mile-shipment-created.command.js';

/**
 * Reactor for `LastMileShipmentCreated`.
 *
 * Closes the fulfilment ↔ shipment loop opened by
 * `HandleLastMileFulfilmentCreated`:
 *  - Load the just-created shipment (source of truth for parcel/line IDs +
 *    status — don't trust the inbound payload for state the DB owns).
 *  - Load the parent fulfilment.
 *  - Append a `LinkedShipment` and clear `reaction.awaitingEventType`.
 *  - Emit `LastMileFulfilmentShipmentLinked` so downstream consumers (read
 *    models, dashboards, sweepers) can observe the linkage.
 *
 * Idempotency: if the shipment is already linked (retry / duplicate
 * delivery), the reactor returns a no-op success path via `Effect.fail` on a
 * benign business-rule code that the route maps to 200/duplicate-skipped.
 *
 * Actually — we use a different approach: emit the event with a `noop` marker
 * if already linked. For v1 we keep it simple: fail with a
 * `BusinessRuleViolation` whose code marks duplicates so the route can decide
 * to 200 it. (Not implemented in v1; FlowCatalyst's deduplicationId on the
 * dispatch job is the primary defense.)
 */
export class HandleLastMileShipmentCreatedUseCase {
  constructor(
    private readonly fulfilments: LastMileFulfilmentRepository,
    private readonly shipments: LastMileShipmentRepository,
  ) {}

  execute = (
    input: HandleLastMileShipmentCreatedInput,
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
            message: `Scope tenant ${scope.tenant?.tenantId ?? '(none)'} does not match inbound event tenant ${input.tenantId}.`,
          }),
        );
      }
      const tenantId = asTenantId(input.tenantId);
      const shipmentId = asShipmentId(input.shipmentId);

      // 2. Load the shipment — source of truth for parcel/line IDs + status.
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

      // 3. Load the parent fulfilment.
      const fulfilment = yield* Effect.tryPromise({
        try: () =>
          fulfilments.findById(
            tenantId,
            asLastMileFulfilmentId(shipment.fulfilmentId),
          ),
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
            message: `Parent fulfilment ${shipment.fulfilmentId} not found in tenant ${input.tenantId}.`,
          }),
        );
      }

      // 4. Idempotency — if the shipment is already linked, surface a
      //    business-rule violation so the route can map it to a 200 (event
      //    accepted, no work to do).
      if (LastMileFulfilment.isShipmentLinked(fulfilment, shipmentId)) {
        return yield* Effect.fail(
          new BusinessRuleViolation({
            code: 'SHIPMENT_ALREADY_LINKED',
            message: `Shipment ${input.shipmentId} is already linked to fulfilment ${fulfilment.id}.`,
            details: { fulfilmentId: fulfilment.id, shipmentId: shipment.id },
          }),
        );
      }

      // 5. Build the LinkedShipment value object and the updated aggregate.
      const linkedShipment: LinkedShipment = {
        shipmentId: shipment.id,
        parcelIds: shipment.parcels.map((p) => asParcelId(p.parcelId)),
        lineIds: shipment.lines.map((l) => asPromisedLineId(l.lineId)),
        status: shipment.status,
        outcome: null,
        linkedAt: new Date(),
      };
      const updated = LastMileFulfilment.linkShipment(
        fulfilment,
        linkedShipment,
        input.handledEventId,
        linkedShipment.linkedAt,
      );

      // 6. Build the event + atomic commit.
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
