import type { FastifyInstance } from 'fastify';
import { Result } from 'effect';
import { ScopeStore } from '@fulfil/framework';

import type { AppContext } from '../../../app-context.js';
import { resolveScope } from '../../hooks/resolve-scope.js';
import { sendUseCaseError } from '../../plugins/error-mapper.js';
import {
  LastMileShipmentCreatedWebhookRouteSchema,
  type LastMileShipmentCreatedWebhookBody,
  type LastMileShipmentCreatedWebhookResponse,
} from '../../schemas/reactors/last-mile-shipment-created.endpoint.js';

/**
 * POST /reactors/last-mile-shipment-created — inbound webhook from
 * FlowCatalyst for `fulfil:lastmile:shipment:created`.
 *
 * Closes the fulfilment ↔ shipment loop opened by the fulfilment-created
 * reactor: appends a `LinkedShipment` to the parent fulfilment + clears the
 * `reaction.awaitingEventType` flag the upstream reactor set.
 *
 * Idempotency: the use case fails with `SHIPMENT_ALREADY_LINKED` on duplicate
 * deliveries; the route maps that specific code to a 200 `skipped_duplicate`
 * response so FlowCatalyst doesn't retry.
 *
 * TODO(auth): verify HMAC signature on the inbound request.
 */
export function registerLastMileShipmentCreatedReactorRoute(
  fastify: FastifyInstance,
  appContext: AppContext,
): void {
  fastify.post<{ Body: LastMileShipmentCreatedWebhookBody }>(
    '/reactors/last-mile-shipment-created',
    { schema: LastMileShipmentCreatedWebhookRouteSchema },
    async (request, reply) => {
      const scope = resolveScope(request, {
        fallbackPrincipalId: 'fulfil:reactor:last-mile-shipment',
        bodyTenantId: request.body.tenantId,
      });

      const handledEventId =
        readHeader(request.headers['x-fc-event-id']) ?? request.id;

      const result = await ScopeStore.run(scope, () =>
        appContext.runWrite(
          appContext.useCases.handleLastMileShipmentCreated.execute({
            shipmentId: request.body.shipmentId,
            tenantId: request.body.tenantId,
            handledEventId,
          }),
          scope,
        ),
      );

      if (Result.isFailure(result)) {
        // Map idempotent duplicates to a 200 so FlowCatalyst doesn't retry.
        if (
          result.failure._tag === 'BusinessRuleViolation' &&
          result.failure.code === 'SHIPMENT_ALREADY_LINKED'
        ) {
          const body: LastMileShipmentCreatedWebhookResponse = {
            status: 'skipped_duplicate',
          };
          return reply.code(200).send(body);
        }
        return sendUseCaseError(reply, result.failure);
      }

      const data = result.success.event.getData();
      const body: LastMileShipmentCreatedWebhookResponse = {
        status: 'accepted',
        fulfilmentId: data.fulfilmentId,
        linkedShipmentCount: data.linkedShipmentCount,
      };
      return reply.code(200).send(body);
    },
  );
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}
