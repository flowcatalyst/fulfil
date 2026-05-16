import type { FastifyReply } from 'fastify';
import { httpStatus, type UseCaseError } from '@fulfil/framework';

/**
 * Map a tagged `UseCaseError` (Effect surface) to an HTTP response shaped
 * according to `ErrorResponseSchema`. Status code comes from `httpStatus`:
 *   ValidationError → 400, AuthorizationError → 403, NotFoundError → 404,
 *   BusinessRuleViolation / ConcurrencyError → 409, InfrastructureError → 500.
 */
export function sendUseCaseError(
  reply: FastifyReply,
  error: UseCaseError,
): FastifyReply {
  const status = httpStatus(error);
  const details =
    error.details !== undefined && Object.keys(error.details).length > 0
      ? error.details
      : undefined;

  return reply.code(status).send({
    error: {
      type: error._tag,
      code: error.code,
      message: error.message,
      ...(details !== undefined ? { details } : {}),
    },
  });
}
