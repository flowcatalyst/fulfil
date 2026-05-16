import { Effect } from 'effect';
import { CreateDispatchJobDto } from '@flowcatalyst/sdk';
import {
  BusinessRuleViolation,
  ScopeStore,
  UnitOfWork,
  ValidationError,
  type Sealed,
  type UseCaseError,
} from '@fulfil/framework';
import type { CreateLastMileShipmentCommand } from '@fulfil/shared';

import { DispatchJobBroker } from '../../infrastructure/unit-of-work.js';
import {
  asLastMileFulfilmentId,
  asTenantId,
} from '../../domain/lastmile/ids.js';
import type { LastMileFulfilmentRepository } from '../../domain/lastmile/last-mile-fulfilment.repository.js';
import { LastMileFulfilmentShipmentRequested } from '../../domain/lastmile/events/last-mile-fulfilment-shipment-requested.event.js';

import type { HandleLastMileFulfilmentCreatedInput } from './handle-last-mile-fulfilment-created.command.js';

export interface HandleLastMileFulfilmentCreatedConfig {
  /**
   * Public base URL of this Fulfil instance — used to construct the
   * dispatch job's `targetUrl` (e.g. `${publicBaseUrl}/shipments`). Must
   * be the address FlowCatalyst can reach from its dispatcher.
   */
  readonly publicBaseUrl: string;
  /** Dispatch-pool code that handles `fulfil:lastmile:shipment:create` jobs. */
  readonly dispatchPoolCode: string;
}

/**
 * Reactor for `LastMileFulfilmentCreated`.
 *
 * Decides whether the fulfilment is ready to spawn a shipment:
 *  - If both collection and drop-off `geo` are set → emit a dispatch job to
 *    `${publicBaseUrl}/shipments` carrying a `CreateLastMileShipment` command
 *    + emit `LastMileFulfilmentShipmentRequested` for audit.
 *  - Else → fail with `LOCATIONS_NOT_GEOCODED` (the schema currently requires
 *    geo, so this is a defensive guard. When geo becomes optional, this
 *    branch will instead emit a `LastMileFulfilmentAwaitingGeocoding` event
 *    and let a separate orchestrator — e.g. Pinpoint — produce
 *    `LocationsGeocoded`).
 *
 * Identity: the route handler binds a `Scope.fromParentEvent(...)` before
 * invoking this use case, so `ScopeStore.require()` resolves to a
 * service-principal scope chained to the upstream event's correlation.
 *
 * `R = UnitOfWork | DispatchJobBroker` — no `AggregateRegistry` because v1
 * doesn't mutate the fulfilment (reaction-bookkeeping update deferred).
 */
export class HandleLastMileFulfilmentCreatedUseCase {
  constructor(
    private readonly fulfilments: LastMileFulfilmentRepository,
    private readonly config: HandleLastMileFulfilmentCreatedConfig,
  ) {}

  execute = (
    input: HandleLastMileFulfilmentCreatedInput,
  ): Effect.Effect<
    Sealed<LastMileFulfilmentShipmentRequested>,
    UseCaseError,
    UnitOfWork | DispatchJobBroker
  > => {
    const fulfilments = this.fulfilments;
    const { publicBaseUrl, dispatchPoolCode } = this.config;

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
      const fulfilmentId = asLastMileFulfilmentId(input.fulfilmentId);

      // 2. Idempotency / referential guard. The fulfilment must still exist.
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

      // 3. Geo precondition — needs both ends. Schema currently makes geo
      //    required so this is defensive; when geo becomes optional, the
      //    "not ready" branch will emit a different event + dispatch a
      //    geocoding job instead of failing.
      if (!fulfilment.collection.geo || !fulfilment.dropOff.geo) {
        return yield* Effect.fail(
          new BusinessRuleViolation({
            code: 'LOCATIONS_NOT_GEOCODED',
            message:
              'Fulfilment locations are not geocoded; shipment creation deferred.',
            details: { fulfilmentId: input.fulfilmentId },
          }),
        );
      }

      // 4. Build the shipment command from the fulfilment (snapshotted into
      //    the dispatch job's payload — the shipment owns this copy from
      //    here on).
      const shipmentCommand: CreateLastMileShipmentCommand = {
        tenantId: fulfilment.tenantId,
        fulfilmentId: fulfilment.id,
        collection: fulfilment.collection,
        dropOff: fulfilment.dropOff,
        consignee: fulfilment.consignee,
        promisedWindow: fulfilment.promisedWindow,
        lines: [...fulfilment.lines],
        parcels: [...fulfilment.parcels],
        temperatureZone: fulfilment.temperatureZone,
        handling: [...fulfilment.handling],
        metadata: fulfilment.metadata,
      };

      const targetUrl = `${publicBaseUrl}/shipments`;
      const dispatchJob = CreateDispatchJobDto.create(
        'fulfil:lastmile',
        'fulfil:lastmile:shipment:create',
        targetUrl,
        JSON.stringify(shipmentCommand),
        dispatchPoolCode,
      )
        .withCorrelationId(scope.correlationId)
        .withSubject(`platform.fulfilment.${fulfilment.id}`)
        .withMessageGroup(`platform.fulfilment.${fulfilment.id}`)
        .withDataOnly(true);

      // 5. Emit the dispatch job FIRST so we have its ID for the audit event.
      const broker = yield* DispatchJobBroker;
      const dispatchJobId = yield* broker.emit(dispatchJob);

      // 6. Emit the audit event recording what the reactor decided. Both
      //    writes are in the same Drizzle tx via TransactionStore — if the
      //    event emission fails, the dispatch job's outbox row rolls back too.
      const event = new LastMileFulfilmentShipmentRequested(scope, {
        fulfilmentId: fulfilment.id,
        tenantId: fulfilment.tenantId,
        dispatchJobId,
        targetUrl,
      });
      const uow = yield* UnitOfWork;
      return yield* uow.emitEvent(event, input);
    });
  };
}
