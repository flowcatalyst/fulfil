import { Effect } from 'effect';
import { CreateDispatchJobDto } from '@flowcatalyst/sdk';
import {
  ScopeStore,
  UnitOfWork,
  ValidationError,
  type Sealed,
  type UseCaseError,
} from '@fulfil/framework';
import type { LinkShipmentToFulfilmentCommand } from '@fulfil/shared';

import { DispatchJobBroker } from '../../infrastructure/unit-of-work.js';
import {
  asLastMileFulfilmentId,
  asShipmentId,
  asTenantId,
} from '../../domain/lastmile/ids.js';
import { LastMileFulfilmentShipmentLinkDispatched } from '../../domain/lastmile/events/last-mile-fulfilment-shipment-link-dispatched.event.js';

import type { HandleLastMileShipmentCreatedInput } from './handle-last-mile-shipment-created.command.js';

export interface HandleLastMileShipmentCreatedConfig {
  /** Used to construct the dispatch job's `targetUrl`. */
  readonly publicBaseUrl: string;
  /** Dispatch-pool code Fulfil's internal dispatch jobs ride on. */
  readonly dispatchPoolCode: string;
}

/**
 * Process handler for `LastMileShipmentCreated`.
 *
 * Pure decider: the work of appending the shipment onto the fulfilment's
 * `linkedShipments` lives in `LinkShipmentToFulfilmentUseCase` at the
 * `POST /fulfilments/:id/link-shipment` dispatch target. This handler
 * emits one dispatch job for that action and an audit event for the
 * decision itself.
 *
 * Why dispatch instead of inline: the fulfilment is a *different*
 * aggregate from the shipment whose event we're handling. Per the process
 * pattern, cross-aggregate work goes through dispatch jobs so it's
 * independently retryable from anything else the process does.
 */
export class HandleLastMileShipmentCreatedUseCase {
  constructor(private readonly config: HandleLastMileShipmentCreatedConfig) {}

  execute = (
    input: HandleLastMileShipmentCreatedInput,
  ): Effect.Effect<
    Sealed<LastMileFulfilmentShipmentLinkDispatched>,
    UseCaseError,
    UnitOfWork | DispatchJobBroker
  > => {
    const { publicBaseUrl, dispatchPoolCode } = this.config;
    return Effect.gen(function* () {
      const scope = ScopeStore.require();

      if (!scope.tenant || scope.tenant.tenantId !== input.tenantId) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'TENANT_MISMATCH',
            message: `Scope tenant ${scope.tenant?.tenantId ?? '(none)'} does not match inbound event tenant ${input.tenantId}.`,
          }),
        );
      }

      // The shipment-created payload doesn't carry fulfilmentId directly
      // in this slim handler. We need it to construct the URL — but it's
      // not in `HandleLastMileShipmentCreatedInput`. Add it.
      if (!input.fulfilmentId) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'FULFILMENT_ID_MISSING',
            message:
              'shipment:created event must carry fulfilmentId on the data payload.',
          }),
        );
      }

      const linkCommand: LinkShipmentToFulfilmentCommand = {
        shipmentId: input.shipmentId,
        tenantId: input.tenantId,
        ...(input.handledEventId && { handledEventId: input.handledEventId }),
      };
      const targetUrl = `${publicBaseUrl}/fulfilments/${input.fulfilmentId}/link-shipment`;

      const dispatchJob = CreateDispatchJobDto.create(
        'fulfil:lastmile',
        'fulfil:lastmile:fulfilment:link-shipment',
        targetUrl,
        JSON.stringify(linkCommand),
        dispatchPoolCode,
      )
        .withCorrelationId(scope.correlationId)
        .withSubject(`platform.fulfilment.${input.fulfilmentId}`)
        .withMessageGroup(`platform.fulfilment.${input.fulfilmentId}`)
        .withDataOnly(true);

      const broker = yield* DispatchJobBroker;
      const dispatchJobId = yield* broker.emit(dispatchJob);

      const event = new LastMileFulfilmentShipmentLinkDispatched(scope, {
        fulfilmentId: asLastMileFulfilmentId(input.fulfilmentId),
        tenantId: asTenantId(input.tenantId),
        shipmentId: asShipmentId(input.shipmentId),
        dispatchJobId,
        targetUrl,
      });
      const uow = yield* UnitOfWork;
      return yield* uow.emitEvent(event, input);
    });
  };
}
