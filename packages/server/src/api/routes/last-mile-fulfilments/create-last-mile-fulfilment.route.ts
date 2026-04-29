import type { FastifyInstance } from 'fastify';
import { Result, ScopeStore } from '@fulfil/framework';
import {
  TemperatureZone,
  type CreateLastMileFulfilmentCommand,
} from '@fulfil/shared';

import type { CreateLastMileFulfilmentUseCase } from '../../../operations/create-last-mile-fulfilment/create-last-mile-fulfilment.use-case.js';
import { sendUseCaseError } from '../../plugins/error-mapper.js';
import {
  CreateLastMileFulfilmentRouteSchema,
  type CreateLastMileFulfilmentBody,
  type CreateLastMileFulfilmentResponse,
} from '../../schemas/lastmile/endpoints/create-last-mile-fulfilment.endpoint.js';

/**
 * POST /fulfilments — create a LastMileFulfilment from a fully-hydrated command.
 *
 * Pipeline:
 *   1. Fastify + TypeBox validate the wire body's structure (rejects unknown
 *      keys and bad shapes with a built-in 400 plus AJV applies declared
 *      defaults like `revision: 1`).
 *   2. `bodyToCommand` adapts the validated wire body into the use case's
 *      command shape — converts ISO `date-time` strings to `Date` objects
 *      and supplies defaults the wire schema doesn't (e.g. `temperatureZone`).
 *   3. The use case enforces business rules (uniqueness, window-after-now,
 *      end-after-start, line/parcel invariants) and commits via UnitOfWork.
 *   4. `Result` is mapped to HTTP: success → 201 with a summary, failure →
 *      the appropriate 4xx/5xx via `sendUseCaseError`.
 */
export function registerCreateLastMileFulfilmentRoute(
  fastify: FastifyInstance,
  useCase: CreateLastMileFulfilmentUseCase,
): void {
  fastify.post<{ Body: CreateLastMileFulfilmentBody }>(
    '/fulfilments',
    { schema: CreateLastMileFulfilmentRouteSchema },
    async (request, reply) => {
      const command = bodyToCommand(request.body);

      // SecuredUseCase takes an ExecutionContext; our Scope is structurally
      // compatible (ExecutionContext's 5 fields are a subset of Scope's).
      const scope = ScopeStore.require();
      const result = await useCase.execute(command, scope);

      if (Result.isFailure(result)) {
        return sendUseCaseError(reply, result.error);
      }

      const data = result.value.getData();
      const body: CreateLastMileFulfilmentResponse = {
        fulfilmentId: data.fulfilmentId,
        tenantId: data.tenantId,
        sourceNote: data.sourceNote,
        stage: 'awaiting_planning',
        promisedWindow: {
          start: data.promisedWindow.start.toISOString(),
          end: data.promisedWindow.end.toISOString(),
        },
        createdAt: result.value.time.toISOString(),
      };
      return reply.code(201).send(body);
    },
  );
}

/**
 * Adapt the wire body (TypeBox-validated) into the use case's command type.
 *
 * - Converts ISO `date-time` strings into `Date` instances on `promisedWindow`
 *   and (when present) `collection.collectionWindow`.
 * - Supplies defaults for command fields the wire schema marks optional but
 *   the use case expects materialised: `temperatureZone`, `handling`,
 *   `metadata`, `sourceNote.revision`, `dropOff.access`, parcel
 *   `lineRefs`/`status`/`metadata`, and line `metadata`.
 *
 * Cross-field semantics (`end > start`) are enforced in the use case's
 * `validate()` — this adapter is shape-only.
 */
function bodyToCommand(
  body: CreateLastMileFulfilmentBody,
): CreateLastMileFulfilmentCommand {
  return {
    sourceNote: {
      system: body.sourceNote.system,
      type: body.sourceNote.type,
      number: body.sourceNote.number,
      revision: body.sourceNote.revision ?? 1,
    },
    orderRef: body.orderRef,
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
    lines: body.lines?.map((l) => ({
      ...l,
      metadata: l.metadata ?? {},
    })),
    parcels: body.parcels?.map((p) => ({
      ...p,
      lineRefs: p.lineRefs ?? [],
      status: p.status ?? 'packed',
      metadata: p.metadata ?? {},
    })),
    temperatureZone: body.temperatureZone ?? TemperatureZone.Ambient,
    handling: body.handling ?? [],
    metadata: body.metadata ?? {},
  };
}
