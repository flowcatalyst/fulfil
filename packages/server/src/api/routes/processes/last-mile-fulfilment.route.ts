import type { FastifyInstance, FastifyReply } from 'fastify';
import { Result } from 'effect';
import { ScopeStore } from '@fulfil/framework';

import type { AppContext } from '../../../app-context.js';
import { resolveScope } from '../../hooks/resolve-scope.js';
import { sendUseCaseError } from '../../plugins/error-mapper.js';
import { LastMileFulfilmentShipmentRequested } from '../../../domain/lastmile/events/last-mile-fulfilment-shipment-requested.event.js';
import {
  LastMileFulfilmentProcessRouteSchema,
  type LastMileFulfilmentProcessBody,
  type LastMileFulfilmentProcessResponse,
} from '../../schemas/processes/last-mile-fulfilment.endpoint.js';

const PROCESS_PRINCIPAL_ID = 'fulfil:process:last-mile-fulfilment';

const SUPPORTED_EVENT_TYPES = [
  'fulfil:lastmile:fulfilment:created',
  'fulfil:lastmile:shipment:created',
] as const;
type SupportedEventType = (typeof SUPPORTED_EVENT_TYPES)[number];

/**
 * POST /processes/last-mile-fulfilment — single inbound webhook for every
 * event that drives the LastMile fulfilment process.
 *
 * Routes on `x-fc-event-type` to per-event handlers. Each handler is the
 * decider for that event type; cross-aggregate work goes out as dispatch
 * jobs. Inline within-aggregate writes (e.g. setting the fulfilment's
 * reaction bookkeeping on the awaiting branch) stay in the handler.
 */
export function registerLastMileFulfilmentProcessRoute(
  fastify: FastifyInstance,
  appContext: AppContext,
): void {
  fastify.post<{ Body: LastMileFulfilmentProcessBody }>(
    '/processes/last-mile-fulfilment',
    { schema: LastMileFulfilmentProcessRouteSchema },
    async (request, reply) => {
      const eventType = readHeader(request.headers['x-fc-event-type']);
      if (!eventType || !isSupportedEventType(eventType)) {
        return reply.code(400).send({
          error: {
            type: 'ValidationError',
            code: 'UNSUPPORTED_EVENT_TYPE',
            message: `Process does not handle event type '${eventType ?? '(missing)'}'. Supported: ${SUPPORTED_EVENT_TYPES.join(', ')}.`,
          },
        });
      }

      // Tenant rides on the event's data payload for both event types.
      const bodyTenantId = (request.body as { tenantId?: string }).tenantId;
      const scope = resolveScope(request, {
        fallbackPrincipalId: PROCESS_PRINCIPAL_ID,
        ...(bodyTenantId && { bodyTenantId }),
      });
      const handledEventId = readHeader(request.headers['x-fc-event-id']);

      switch (eventType) {
        case 'fulfil:lastmile:fulfilment:created':
          return runFulfilmentCreated(
            appContext,
            request.body as { fulfilmentId: string; tenantId: string },
            scope,
            handledEventId,
            reply,
          );
        case 'fulfil:lastmile:shipment:created':
          return runShipmentCreated(
            appContext,
            request.body as {
              shipmentId: string;
              tenantId: string;
              fulfilmentId: string;
            },
            scope,
            handledEventId,
            reply,
          );
      }
    },
  );
}

async function runFulfilmentCreated(
  appContext: AppContext,
  body: { fulfilmentId: string; tenantId: string },
  scope: ReturnType<typeof resolveScope>,
  handledEventId: string | undefined,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const result = await ScopeStore.run(scope, () =>
    appContext.runWrite(
      appContext.useCases.handleLastMileFulfilmentCreated.execute({
        fulfilmentId: body.fulfilmentId,
        tenantId: body.tenantId,
        ...(handledEventId !== undefined && { handledEventId }),
      }),
      scope,
    ),
  );

  if (Result.isFailure(result)) {
    return sendUseCaseError(reply, result.failure);
  }

  const event = result.success.event;
  let response: LastMileFulfilmentProcessResponse;
  if (event instanceof LastMileFulfilmentShipmentRequested) {
    const data = event.getData();
    response = {
      status: 'shipment-requested',
      dispatchJobId: data.dispatchJobId,
      targetUrl: data.targetUrl,
    };
  } else {
    // LastMileFulfilmentAwaitingGeocoding.
    const data = event.getData();
    response = {
      status: 'awaiting-geocoding',
      fulfilmentId: data.fulfilmentId,
      missingLegs: data.missingLegs.map((leg) => leg),
      awaitingEventType: 'fulfil:lastmile:fulfilment:locations-geocoded',
    };
  }
  return reply.code(200).send(response);
}

async function runShipmentCreated(
  appContext: AppContext,
  body: { shipmentId: string; tenantId: string; fulfilmentId: string },
  scope: ReturnType<typeof resolveScope>,
  handledEventId: string | undefined,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const result = await ScopeStore.run(scope, () =>
    appContext.runWrite(
      appContext.useCases.handleLastMileShipmentCreated.execute({
        shipmentId: body.shipmentId,
        tenantId: body.tenantId,
        fulfilmentId: body.fulfilmentId,
        ...(handledEventId !== undefined && { handledEventId }),
      }),
      scope,
    ),
  );

  if (Result.isFailure(result)) {
    return sendUseCaseError(reply, result.failure);
  }

  const data = result.success.event.getData();
  const response: LastMileFulfilmentProcessResponse = {
    status: 'shipment-link-dispatched',
    dispatchJobId: data.dispatchJobId,
    targetUrl: data.targetUrl,
  };
  return reply.code(200).send(response);
}

function isSupportedEventType(value: string): value is SupportedEventType {
  return (SUPPORTED_EVENT_TYPES as readonly string[]).includes(value);
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

