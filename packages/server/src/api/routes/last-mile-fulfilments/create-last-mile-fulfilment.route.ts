import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import {
  Result,
  ScopeStore,
  UseCaseError,
} from '@fulfil/framework';
import { CreateLastMileFulfilmentCommandSchema } from '@fulfil/shared';

import type { CreateLastMileFulfilmentUseCase } from '../../../operations/create-last-mile-fulfilment/create-last-mile-fulfilment.use-case.js';
import { sendUseCaseError } from '../../plugins/error-mapper.js';
import {
  CreateLastMileFulfilmentRouteSchema,
  type CreateLastMileFulfilmentResponse,
} from '../../schemas/lastmile/endpoints/create-last-mile-fulfilment.endpoint.js';

/**
 * POST /fulfilments — create a LastMileFulfilment from a fully-hydrated command.
 *
 * Pipeline:
 *   1. Fastify + TypeBox validate the body's structure (rejects unknown keys
 *      and bad shapes with a built-in 400).
 *   2. Zod re-parses to coerce ISO `date-time` strings into `Date` objects
 *      and apply domain refinements (e.g. `end > start`).
 *   3. The use case enforces business rules and commits via UnitOfWork.
 *   4. We map `Result` → HTTP: success → 201 with a summary; failure → the
 *      appropriate 4xx/5xx via `sendUseCaseError`.
 */
export function registerCreateLastMileFulfilmentRoute(
  fastify: FastifyInstance,
  useCase: CreateLastMileFulfilmentUseCase,
): void {
  fastify.post(
    '/fulfilments',
    { schema: CreateLastMileFulfilmentRouteSchema },
    async (request, reply) => {
      // Zod coercion + domain-refine validation. TypeBox has already
      // validated structure; this handles ISO → Date and cross-field rules
      // JSON Schema can't express.
      let command;
      try {
        command = CreateLastMileFulfilmentCommandSchema.parse(request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          const first = err.issues[0];
          return sendUseCaseError(
            reply,
            UseCaseError.validation(
              'COMMAND_VALIDATION_FAILED',
              first?.message ?? 'Invalid command payload.',
              { issues: err.issues },
            ),
          );
        }
        throw err;
      }

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
