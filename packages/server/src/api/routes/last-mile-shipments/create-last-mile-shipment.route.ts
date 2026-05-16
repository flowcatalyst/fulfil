import type { FastifyInstance } from 'fastify';
import { Result } from 'effect';
import { ScopeStore } from '@fulfil/framework';
import {
  TemperatureZone,
  type CreateLastMileShipmentCommand,
} from '@fulfil/shared';

import type { AppContext } from '../../../app-context.js';
import { resolveScope } from '../../hooks/resolve-scope.js';
import { sendUseCaseError } from '../../plugins/error-mapper.js';
import {
  CreateLastMileShipmentRouteSchema,
  type CreateLastMileShipmentBody,
  type CreateLastMileShipmentResponse,
} from '../../schemas/lastmile/endpoints/create-last-mile-shipment.endpoint.js';

/**
 * POST /shipments — create a LastMileShipment from a fulfilment-derived
 * command. Normally invoked by the fulfilment reactor's dispatch job, not by
 * a human user. The route handler is identical in shape to the user-facing
 * `POST /fulfilments` route — Fulfil's "boundary runner" pattern doesn't
 * distinguish webhook-triggered vs user-triggered writes.
 */
export function registerCreateLastMileShipmentRoute(
  fastify: FastifyInstance,
  appContext: AppContext,
): void {
  fastify.post<{ Body: CreateLastMileShipmentBody }>(
    '/shipments',
    { schema: CreateLastMileShipmentRouteSchema },
    async (request, reply) => {
      const command = bodyToCommand(request.body);
      const scope = resolveScope(request, {
        fallbackPrincipalId: 'fulfil:dispatch:shipment',
        bodyTenantId: command.tenantId,
      });

      const result = await ScopeStore.run(scope, () =>
        appContext.runWrite(
          appContext.useCases.createLastMileShipment.execute(command),
          scope,
        ),
      );

      if (Result.isFailure(result)) {
        return sendUseCaseError(reply, result.failure);
      }

      const event = result.success.event;
      const data = event.getData();
      const body: CreateLastMileShipmentResponse = {
        shipmentId: data.shipmentId,
        tenantId: data.tenantId,
        fulfilmentId: data.fulfilmentId,
        status: data.status,
        createdAt: event.time.toISOString(),
      };
      return reply.code(201).send(body);
    },
  );
}

function bodyToCommand(
  body: CreateLastMileShipmentBody,
): CreateLastMileShipmentCommand {
  return {
    tenantId: body.tenantId,
    fulfilmentId: body.fulfilmentId,
    collection: {
      ...body.collection,
      collectionWindow: body.collection.collectionWindow
        ? {
            start: new Date(body.collection.collectionWindow.start),
            end: new Date(body.collection.collectionWindow.end),
          }
        : undefined,
    },
    dropOff: {
      ...body.dropOff,
      access: body.dropOff.access ?? {},
    },
    consignee: body.consignee,
    promisedWindow: {
      start: new Date(body.promisedWindow.start),
      end: new Date(body.promisedWindow.end),
    },
    lines: body.lines ?? [],
    parcels: body.parcels ?? [],
    temperatureZone: body.temperatureZone ?? TemperatureZone.Ambient,
    handling: body.handling ?? [],
    metadata: body.metadata ?? {},
  };
}
