import type { FastifyInstance } from 'fastify';
import { Result } from 'effect';
import { ScopeStore } from '@fulfil/framework';

import type { AppContext } from '../../../app-context.js';
import { resolveScope } from '../../hooks/resolve-scope.js';
import { sendUseCaseError } from '../../plugins/error-mapper.js';
import {
  LastMileFulfilmentCreatedWebhookRouteSchema,
  type LastMileFulfilmentCreatedWebhookBody,
  type LastMileFulfilmentCreatedWebhookResponse,
} from '../../schemas/reactors/last-mile-fulfilment-created.endpoint.js';

/**
 * POST /reactors/last-mile-fulfilment-created — inbound webhook from
 * FlowCatalyst for `fulfil:lastmile:fulfilment:created`.
 *
 * `resolveScope` synthesises a `Scope.fromParentEvent` chained to the
 * upstream event using `x-fc-*` headers, then runs the reactor use case via
 * `AppContext.runWrite`.
 *
 * TODO(auth): verify HMAC signature on the inbound request against the
 * FlowCatalyst subscription's signing key before processing.
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

      const result = await ScopeStore.run(scope, () =>
        appContext.runWrite(
          appContext.useCases.handleLastMileFulfilmentCreated.execute({
            fulfilmentId: request.body.fulfilmentId,
            tenantId: request.body.tenantId,
          }),
          scope,
        ),
      );

      if (Result.isFailure(result)) {
        return sendUseCaseError(reply, result.failure);
      }

      const data = result.success.event.getData();
      const body: LastMileFulfilmentCreatedWebhookResponse = {
        status: 'accepted',
        dispatchJobId: data.dispatchJobId,
        targetUrl: data.targetUrl,
      };
      return reply.code(200).send(body);
    },
  );
}
