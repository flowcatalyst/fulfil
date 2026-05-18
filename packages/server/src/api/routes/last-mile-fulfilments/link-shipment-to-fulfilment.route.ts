import type { FastifyInstance } from 'fastify';
import { Result } from 'effect';
import { ScopeStore } from '@fulfil/framework';

import type { AppContext } from '../../../app-context.js';
import { resolveScope } from '../../hooks/resolve-scope.js';
import {
  flowcatalystWebhookAuthHook,
  type WebhookAuthHookOptions,
} from '../../plugins/flowcatalyst-webhook-auth.js';
import { sendUseCaseError } from '../../plugins/error-mapper.js';
import {
  LinkShipmentToFulfilmentRouteSchema,
  type LinkShipmentToFulfilmentBody,
  type LinkShipmentToFulfilmentParams,
  type LinkShipmentToFulfilmentResponse,
} from '../../schemas/lastmile/endpoints/link-shipment-to-fulfilment.endpoint.js';

/**
 * POST /fulfilments/:fulfilmentId/link-shipment — dispatch target invoked by
 * the LastMile process on `shipment:created`. HMAC-verified.
 *
 * Idempotency: the use case fails with `SHIPMENT_ALREADY_LINKED` on
 * duplicate dispatches; this route maps that to HTTP 200 `skipped_duplicate`
 * so FlowCatalyst doesn't retry.
 */
export function registerLinkShipmentToFulfilmentRoute(
  fastify: FastifyInstance,
  appContext: AppContext,
  webhookAuth: WebhookAuthHookOptions,
): void {
  fastify.post<{
    Params: LinkShipmentToFulfilmentParams;
    Body: LinkShipmentToFulfilmentBody;
  }>(
    '/fulfilments/:fulfilmentId/link-shipment',
    {
      schema: LinkShipmentToFulfilmentRouteSchema,
      preHandler: [flowcatalystWebhookAuthHook(webhookAuth)],
    },
    async (request, reply) => {
      const scope = resolveScope(request, {
        fallbackPrincipalId: 'fulfil:dispatch:link-shipment',
        bodyTenantId: request.body.tenantId,
      });

      const result = await ScopeStore.run(scope, () =>
        appContext.runWrite(
          appContext.useCases.linkShipmentToFulfilment.execute({
            fulfilmentId: request.params.fulfilmentId,
            shipmentId: request.body.shipmentId,
            tenantId: request.body.tenantId,
            ...(request.body.handledEventId !== undefined && {
              handledEventId: request.body.handledEventId,
            }),
          }),
          scope,
        ),
      );

      if (Result.isFailure(result)) {
        if (
          result.failure._tag === 'BusinessRuleViolation' &&
          result.failure.code === 'SHIPMENT_ALREADY_LINKED'
        ) {
          const body: LinkShipmentToFulfilmentResponse = {
            status: 'skipped_duplicate',
            fulfilmentId: request.params.fulfilmentId,
          };
          return reply.code(200).send(body);
        }
        return sendUseCaseError(reply, result.failure);
      }

      const data = result.success.event.getData();
      const body: LinkShipmentToFulfilmentResponse = {
        status: 'linked',
        fulfilmentId: data.fulfilmentId,
        linkedShipmentCount: data.linkedShipmentCount,
      };
      return reply.code(200).send(body);
    },
  );
}
