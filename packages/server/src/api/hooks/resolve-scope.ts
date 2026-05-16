import type { FastifyRequest } from 'fastify';
import { Scope, ScopeStore, type Scope as ScopeType } from '@fulfil/framework';

/**
 * Resolve a Scope for a request that may be user-initiated OR webhook-driven
 * (FlowCatalyst dispatch). Returns the framework-bound scope if one exists,
 * otherwise constructs one chained to the upstream event using the platform's
 * tracing headers.
 *
 * Webhook header convention:
 *   - `x-fc-event-id`        → originating event ID (becomes causation)
 *   - `x-fc-correlation-id`  → correlation chain
 *   - `x-fc-principal-id`    → optional principal identity (falls back to caller)
 *
 * `fallbackPrincipalId` is used when no FC principal header is present —
 * typically a service-principal name like `'fulfil:reactor:last-mile-...'` or
 * `'fulfil:dispatch:shipment'`. Tenant is taken from `bodyTenantId` when
 * provided (most reactor / dispatch payloads carry it on the data).
 */
export function resolveScope(
  request: FastifyRequest,
  options: {
    readonly fallbackPrincipalId: string;
    readonly bodyTenantId?: string;
  },
): ScopeType {
  const existing = ScopeStore.get();
  if (existing) {
    if (options.bodyTenantId && !existing.tenant) {
      return { ...existing, tenant: { tenantId: options.bodyTenantId } };
    }
    return existing;
  }

  const eventId =
    readHeader(request.headers['x-fc-event-id']) ?? request.id;
  const correlationId =
    readHeader(request.headers['x-fc-correlation-id']) ?? request.id;
  const principalId =
    readHeader(request.headers['x-fc-principal-id']) ??
    options.fallbackPrincipalId;

  const base = Scope.fromParentEvent(
    { correlationId, eventId },
    { principalId },
  );
  return options.bodyTenantId
    ? { ...base, tenant: { tenantId: options.bodyTenantId } }
    : base;
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}
