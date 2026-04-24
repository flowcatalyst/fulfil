import type { FastifyReply } from 'fastify';
import { UseCaseError, type UseCaseError as UseCaseErrorType } from '@fulfil/framework';

/**
 * Map a `UseCaseError` to an HTTP response shaped according to
 * `ErrorResponseSchema`. Status code comes from `UseCaseError.httpStatus(...)`:
 *   validation → 400, authorization → 403, not_found → 404,
 *   business_rule / concurrency → 409, infrastructure → 500.
 */
export function sendUseCaseError(
  reply: FastifyReply,
  error: UseCaseErrorType,
): FastifyReply {
  const status = UseCaseError.httpStatus(error);
  const details =
    error.details !== undefined && Object.keys(error.details).length > 0
      ? error.details
      : undefined;

  return reply.code(status).send({
    error: {
      type: error.type,
      code: error.code,
      message: error.message,
      ...(details !== undefined ? { details } : {}),
    },
  });
}
