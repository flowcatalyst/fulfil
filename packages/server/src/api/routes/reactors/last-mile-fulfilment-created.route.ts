import type { FastifyInstance } from 'fastify';
import { Result } from 'effect';
import { ScopeStore } from '@fulfil/framework';

import type { AppContext } from '../../../app-context.js';
import { resolveScope } from '../../hooks/resolve-scope.js';
import { sendUseCaseError } from '../../plugins/error-mapper.js';
import { LastMileFulfilmentShipmentRequested } from '../../../domain/lastmile/events/last-mile-fulfilment-shipment-requested.event.js';
import {
  LastMileFulfilmentCreatedWebhookRouteSchema,
  type LastMileFulfilmentCreatedWebhookBody,
  type LastMileFulfilmentCreatedWebhookResponse,
} from '../../schemas/reactors/last-mile-fulfilment-created.endpoint.js';

/**
 * POST /reactors/last-mile-fulfilment-created — inbound webhook from
 * FlowCatalyst for `fulfil:lastmile:fulfilment:created`.
 *
 * `resolveScope` builds `Scope.fromParentEvent` from `x-fc-*` headers.
 * The use case returns a union of sealed events — the route narrows via
 * `instanceof` to build the right response shape.
 */
export function registerLastMileFulfilmentCreatedReactorRoute(
  fastify: FastifyInstance,
  appContext: AppContext,
): void {
  fastify.post<{ Body: LastMileFulfilmentCreatedWebhookBody }>(
    '/reactors/last-mile-fulfilment-created',
    { schema: LastMileFulfilmentCreatedWebhookRouteSchema },
    async (request, reply) => {
      const scope = resolveScope(request, {
        fallbackPrincipalId: 'fulfil:reactor:last-mile-fulfilment',
        bodyTenantId: request.body.tenantId,
      });

      const handledEventId = readHeader(request.headers['x-fc-event-id']);

      const result = await ScopeStore.run(scope, () =>
        appContext.runWrite(
          appContext.useCases.handleLastMileFulfilmentCreated.execute({
            fulfilmentId: request.body.fulfilmentId,
            tenantId: request.body.tenantId,
            ...(handledEventId !== undefined && { handledEventId }),
          }),
          scope,
        ),
      );

      if (Result.isFailure(result)) {
        return sendUseCaseError(reply, result.failure);
      }

      const event = result.success.event;
      let body: LastMileFulfilmentCreatedWebhookResponse;
      if (event instanceof LastMileFulfilmentShipmentRequested) {
        const data = event.getData();
        body = {
          status: 'shipment-requested',
          dispatchJobId: data.dispatchJobId,
          targetUrl: data.targetUrl,
        };
      } else {
        // LastMileFulfilmentAwaitingGeocoding.
        const data = event.getData();
        body = {
          status: 'awaiting-geocoding',
          fulfilmentId: data.fulfilmentId,
          missingLegs: data.missingLegs.map((leg) => leg),
          awaitingEventType: 'fulfil:lastmile:fulfilment:locations-geocoded',
        };
      }
      return reply.code(200).send(body);
    },
  );
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}
