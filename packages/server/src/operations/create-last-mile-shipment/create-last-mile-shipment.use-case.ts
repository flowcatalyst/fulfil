import { Effect } from 'effect';
import { generateTsid } from '@flowcatalyst/sdk';
import {
  AuthorizationError,
  BusinessRuleViolation,
  ScopeStore,
  ValidationError,
  type Sealed,
  type UnitOfWork,
  type UseCaseError,
} from '@fulfil/framework';
import { LastMilePermission } from '@fulfil/shared';

import {
  AggregateRegistry,
  commitAggregate,
} from '../../infrastructure/unit-of-work.js';
import {
  asLastMileFulfilmentId,
  asShipmentId,
  asTenantId,
  SHIPMENT_ID_PREFIX,
} from '../../domain/lastmile/ids.js';
import { LastMileShipment } from '../../domain/lastmile/last-mile-shipment.js';
import type { LastMileFulfilmentRepository } from '../../domain/lastmile/last-mile-fulfilment.repository.js';
import { LastMileShipmentCreated } from '../../domain/lastmile/events/last-mile-shipment-created.event.js';

import type { CreateLastMileShipmentCommand } from './create-last-mile-shipment.command.js';

/**
 * Create a `LastMileShipment` from a fully-hydrated command.
 *
 * Triggered by the `HandleLastMileFulfilmentCreated` reactor via a dispatch
 * job — not called directly from a user-facing route in v1. The command
 * carries the cargo + locations + window snapshotted from the parent
 * fulfilment at the moment of dispatch.
 *
 * Invariants enforced:
 *  - Tenant must match the scope's tenant.
 *  - Fulfilment must exist in this tenant (idempotency guard against
 *    rogue dispatch jobs).
 *  - Both collection and drop-off geo must be set (the reactor's
 *    precondition; checked again here defensively).
 *
 * Shipment lifecycle starts in `unfinalised` — goods-availability is
 * confirmed later by a separate use case (`MarkShipmentReady`).
 */
export class CreateLastMileShipmentUseCase {
  static readonly requiredPermission =
    LastMilePermission.PlanLastMileFulfilment;

  constructor(private readonly fulfilments: LastMileFulfilmentRepository) {}

  execute = (
    command: CreateLastMileShipmentCommand,
  ): Effect.Effect<
    Sealed<LastMileShipmentCreated>,
    UseCaseError,
    UnitOfWork | AggregateRegistry
  > => {
    const fulfilments = this.fulfilments;
    const authorize = (): boolean => this.authorize();

    return Effect.gen(function* () {
      const scope = ScopeStore.require();

      // 1. Authorization.
      if (!authorize()) {
        return yield* Effect.fail(
          new AuthorizationError({
            code: 'PERMISSION_DENIED',
            message: `Missing permission ${LastMilePermission.PlanLastMileFulfilment}.`,
          }),
        );
      }

      // 2. Tenant guard. Cross-tenant dispatch jobs would be a bug.
      if (!scope.tenant) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'TENANT_REQUIRED',
            message: 'Shipment creation requires a tenant context.',
          }),
        );
      }
      if (scope.tenant.tenantId !== command.tenantId) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'TENANT_MISMATCH',
            message: `Scope tenant ${scope.tenant.tenantId} does not match command tenant ${command.tenantId}.`,
          }),
        );
      }
      const tenantId = asTenantId(command.tenantId);
      const fulfilmentId = asLastMileFulfilmentId(command.fulfilmentId);

      // 3. Defensive geo recheck — the reactor only dispatches when geo is
      //    set, but the command may be replayed and we want a clean failure.
      if (!command.collection.geo || !command.dropOff.geo) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'LOCATIONS_NOT_GEOCODED',
            message:
              'Both collection.geo and dropOff.geo must be set before creating a shipment.',
          }),
        );
      }

      // 4. Idempotency / referential guard. If the fulfilment vanished
      //    between the reactor and the dispatch arriving, fail loudly.
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
            message: `Fulfilment ${command.fulfilmentId} not found in tenant ${command.tenantId}.`,
          }),
        );
      }

      // 5. Build aggregate + event.
      const shipment = LastMileShipment.create({
        id: asShipmentId(`${SHIPMENT_ID_PREFIX}_${generateTsid()}`),
        tenantId,
        fulfilmentId,
        collection: command.collection,
        dropOff: command.dropOff,
        consignee: command.consignee,
        promisedWindow: command.promisedWindow,
        lines: command.lines,
        parcels: command.parcels,
        temperatureZone: command.temperatureZone,
        handling: command.handling,
        metadata: command.metadata,
        now: new Date(),
      });

      const event = new LastMileShipmentCreated(scope, {
        shipmentId: shipment.id,
        tenantId: shipment.tenantId,
        fulfilmentId: shipment.fulfilmentId,
        collection: shipment.collection,
        dropOff: shipment.dropOff,
        consignee: shipment.consignee,
        promisedWindow: shipment.promisedWindow,
        lineCount: shipment.lines.length,
        parcelCount: shipment.parcels.length,
        temperatureZone: shipment.temperatureZone,
        handling: shipment.handling,
        status: shipment.status,
        metadata: shipment.metadata,
      });

      // 6. Atomic commit.
      return yield* commitAggregate(shipment, event, command);
    });
  };

  private authorize(): boolean {
    // TODO(auth): real permission check.
    return true;
  }
}
