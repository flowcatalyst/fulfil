import type { FastifyBaseLogger } from 'fastify';
import type { Scope } from '../scope/scope.js';

export function createContextLogger(
  baseLogger: FastifyBaseLogger,
  scope: Scope,
): FastifyBaseLogger {
  return baseLogger.child({
    executionId: scope.executionId,
    correlationId: scope.correlationId,
    principalId: scope.principalId,
  });
}
