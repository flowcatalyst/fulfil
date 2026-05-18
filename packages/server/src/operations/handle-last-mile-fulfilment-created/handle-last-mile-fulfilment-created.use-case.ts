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

import {
  AggregateRegistry,
  commitAggregate,
  DispatchJobBroker,
} from '../../infrastructure/unit-of-work.js';
import {
  asLastMileFulfilmentId,
  asTenantId,
} from '../../domain/lastmile/ids.js';
import { LastMileFulfilment } from '../../domain/lastmile/last-mile-fulfilment.js';
import type { LastMileFulfilmentRepository } from '../../domain/lastmile/last-mile-fulfilment.repository.js';
import { LastMileFulfilmentShipmentRequested } from '../../domain/lastmile/events/last-mile-fulfilment-shipment-requested.event.js';
import { LastMileFulfilmentAwaitingGeocoding } from '../../domain/lastmile/events/last-mile-fulfilment-awaiting-geocoding.event.js';

import type { HandleLastMileFulfilmentCreatedInput } from './handle-last-mile-fulfilment-created.command.js';

export interface HandleLastMileFulfilmentCreatedConfig {
  /**
   * Public base URL of this Fulfil instance — used to construct the
   * dispatch job's `targetUrl` (`${publicBaseUrl}/shipments`). Must be
   * reachable from FlowCatalyst's dispatcher.
   */
  readonly publicBaseUrl: string;
  /** Dispatch-pool code that handles `fulfil:lastmile:shipment:create` jobs. */
  readonly dispatchPoolCode: string;
}

/**
 * Event-type marker the fulfilment is parked against while waiting for
 * geocoding. A future reactor listens for the geocoding orchestrator's
 * completion event and wakes the fulfilment (deferred — not in this slice).
 */
const AWAITING_GEOCODING_EVENT_TYPE =
  'fulfil:lastmile:fulfilment:locations-geocoded';

/** Union of events this reactor can seal. */
export type ReactorOutcome =
  | Sealed<LastMileFulfilmentShipmentRequested>
  | Sealed<LastMileFulfilmentAwaitingGeocoding>;

/**
 * Reactor for `LastMileFulfilmentCreated`.
 *
 * Two branches:
 *  1. **Both location ends are geocoded** → emit a `CreateLastMileShipment`
 *     dispatch job to `${publicBaseUrl}/shipments`, plus the
 *     `LastMileFulfilmentShipmentRequested` audit event.
 *  2. **Either end lacks `geo`** → commit the fulfilment with
 *     `reaction.awaitingEventType` set to the geocoding marker, and emit
 *     `LastMileFulfilmentAwaitingGeocoding` with the missing legs. A
 *     client-specific orchestrator (e.g. Pinpoint) subscribes to that
 *     event and is expected to drive the geocoding flow.
 *
 * `R = UnitOfWork | DispatchJobBroker | AggregateRegistry` — the
 * AggregateRegistry tag is required for the awaiting branch which writes
 * the fulfilment aggregate.
 */
export class HandleLastMileFulfilmentCreatedUseCase {
  constructor(
    private readonly fulfilments: LastMileFulfilmentRepository,
    private readonly config: HandleLastMileFulfilmentCreatedConfig,
  ) {}

  execute = (
    input: HandleLastMileFulfilmentCreatedInput,
  ): Effect.Effect<
    ReactorOutcome,
    UseCaseError,
    UnitOfWork | DispatchJobBroker | AggregateRegistry
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

      // 2. Idempotency / referential guard.
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

      // 3. Branch on geo readiness.
      const missingLegs: ('collection' | 'dropOff')[] = [];
      if (!fulfilment.collection.geo) missingLegs.push('collection');
      if (!fulfilment.dropOff.geo) missingLegs.push('dropOff');

      if (missingLegs.length > 0) {
        // Awaiting branch: park the fulfilment + emit the awaiting event.
        const now = new Date();
        const updated = LastMileFulfilment.scheduleReaction(
          fulfilment,
          AWAITING_GEOCODING_EVENT_TYPE,
          input.handledEventId ?? scope.executionId,
          now,
        );
        const awaitingEvent = new LastMileFulfilmentAwaitingGeocoding(scope, {
          fulfilmentId: fulfilment.id,
          tenantId: fulfilment.tenantId,
          missingLegs,
        });
        return yield* commitAggregate(updated, awaitingEvent, input);
      }

      // 4. Happy path: dispatch shipment creation.
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

      const broker = yield* DispatchJobBroker;
      const dispatchJobId = yield* broker.emit(dispatchJob);

      const requestedEvent = new LastMileFulfilmentShipmentRequested(scope, {
        fulfilmentId: fulfilment.id,
        tenantId: fulfilment.tenantId,
        dispatchJobId,
        targetUrl,
      });
      const uow = yield* UnitOfWork;
      return yield* uow.emitEvent(requestedEvent, input);
    });
  };
}
