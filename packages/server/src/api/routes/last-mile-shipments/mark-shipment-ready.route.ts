import type { FastifyInstance } from 'fastify';
import { Result } from 'effect';
import { ScopeStore } from '@fulfil/framework';

import type { AppContext } from '../../../app-context.js';
import { resolveScope } from '../../hooks/resolve-scope.js';
import { sendUseCaseError } from '../../plugins/error-mapper.js';
import {
  MarkShipmentReadyRouteSchema,
  type MarkShipmentReadyBody,
  type MarkShipmentReadyParams,
  type MarkShipmentReadyResponse,
} from '../../schemas/lastmile/endpoints/mark-shipment-ready.endpoint.js';

/**
 * POST /shipments/:shipmentId/ready — mark a shipment as ready for planning.
 *
 * User-facing route (operations / warehouse). Tenant comes from the scope;
 * `resolveScope` falls back to the framework-bound scope if one exists, so
 * user-initiated requests via the `x-user-id` + `x-tenant-id` headers work
 * exactly like the other LastMile routes.
 */
export function registerMarkShipmentReadyRoute(
  fastify: FastifyInstance,
  appContext: AppContext,
): void {
  fastify.post<{
    Params: MarkShipmentReadyParams;
    Body: MarkShipmentReadyBody;
  }>(
    '/shipments/:shipmentId/ready',
    { schema: MarkShipmentReadyRouteSchema },
    async (request, reply) => {
      const scope = resolveScope(request, {
        fallbackPrincipalId: 'fulfil:operator:mark-shipment-ready',
      });

      const result = await ScopeStore.run(scope, () =>
        appContext.runWrite(
          appContext.useCases.markShipmentReady.execute({
            shipmentId: request.params.shipmentId,
            ...(request.body.note !== undefined && { note: request.body.note }),
          }),
          scope,
        ),
      );

      if (Result.isFailure(result)) {
        return sendUseCaseError(reply, result.failure);
      }

      const event = result.success.event;
      const data = event.getData();
      const body: MarkShipmentReadyResponse = {
        shipmentId: data.shipmentId,
        tenantId: data.tenantId,
        fulfilmentId: data.fulfilmentId,
        status: 'ready',
        readiedAt: event.time.toISOString(),
      };
      return reply.code(200).send(body);
    },
  );
}
