import { Effect } from 'effect';
import {
  AuthorizationError,
  BusinessRuleViolation,
  ScopeStore,
  ValidationError,
  type Sealed,
  type UnitOfWork,
  type UseCaseError,
} from '@fulfil/framework';
import { LastMilePermission, ShipmentStatus } from '@fulfil/shared';

import {
  AggregateRegistry,
  commitAggregate,
} from '../../infrastructure/unit-of-work.js';
import {
  asShipmentId,
  asTenantId,
} from '../../domain/lastmile/ids.js';
import { LastMileShipment } from '../../domain/lastmile/last-mile-shipment.js';
import type { LastMileShipmentRepository } from '../../domain/lastmile/last-mile-shipment.repository.js';
import { LastMileShipmentReady } from '../../domain/lastmile/events/last-mile-shipment-ready.event.js';

import type { MarkShipmentReadyCommand } from './mark-shipment-ready.command.js';

/**
 * Transition a shipment from `unfinalised` → `ready`.
 *
 * Invoked by the warehouse/packing operation once goods are confirmed packed.
 * Once `ready`, the shipment is eligible to be planned onto a `Trip` by a
 * separate use case (deferred — Trip aggregate doesn't exist yet).
 *
 * Rules:
 *  - Tenant must be set on the scope.
 *  - Shipment must exist in this tenant.
 *  - Shipment must currently be in `unfinalised`.
 *  - Already-`ready` shipments produce a `BUSINESS_RULE_VIOLATION`
 *    (`SHIPMENT_NOT_UNFINALISED`) — caller decides whether to ignore.
 */
export class MarkShipmentReadyUseCase {
  static readonly requiredPermission = LastMilePermission.MarkShipmentReady;

  constructor(private readonly shipments: LastMileShipmentRepository) {}

  execute = (
    command: MarkShipmentReadyCommand,
  ): Effect.Effect<
    Sealed<LastMileShipmentReady>,
    UseCaseError,
    UnitOfWork | AggregateRegistry
  > => {
    const shipments = this.shipments;
    const authorize = (): boolean => this.authorize();

    return Effect.gen(function* () {
      const scope = ScopeStore.require();

      // 1. Authorization.
      if (!authorize()) {
        return yield* Effect.fail(
          new AuthorizationError({
            code: 'PERMISSION_DENIED',
            message: `Missing permission ${LastMilePermission.MarkShipmentReady}.`,
          }),
        );
      }

      // 2. Tenant precondition.
      if (!scope.tenant) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'TENANT_REQUIRED',
            message: 'Marking a shipment ready requires a tenant context.',
          }),
        );
      }
      const tenantId = asTenantId(scope.tenant.tenantId);
      const shipmentId = asShipmentId(command.shipmentId);

      // 3. Load + existence guard.
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
            message: `Shipment ${command.shipmentId} not found in tenant ${tenantId}.`,
          }),
        );
      }

      // 4. Status precondition.
      if (shipment.status !== ShipmentStatus.Unfinalised) {
        return yield* Effect.fail(
          new BusinessRuleViolation({
            code: 'SHIPMENT_NOT_UNFINALISED',
            message: `Shipment ${shipment.id} is in status '${shipment.status}'; only 'unfinalised' shipments can be marked ready.`,
            details: { currentStatus: shipment.status },
          }),
        );
      }

      // 5. Build the next state + event.
      const now = new Date();
      const updated = LastMileShipment.markReady(shipment, now);

      const event = new LastMileShipmentReady(scope, {
        shipmentId: shipment.id,
        tenantId: shipment.tenantId,
        fulfilmentId: shipment.fulfilmentId,
        note: command.note ?? null,
      });

      return yield* commitAggregate(updated, event, command);
    });
  };

  private authorize(): boolean {
    // TODO(auth): real permission check against the principal's grants.
    return true;
  }
}
