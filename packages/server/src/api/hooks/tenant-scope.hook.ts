import type { FastifyInstance } from 'fastify';
import { ScopeStore, type Scope } from '@fulfil/framework';

/**
 * Register an `onRequest` hook on the root Fastify instance that nests a
 * tenant-augmented Scope into the AsyncLocalStorage.
 *
 * The framework plugin sets a base Scope (`executionId`, `correlationId`,
 * `principalId`, etc.) with `tenant: null`. When the request carries an
 * `x-tenant-id` header, this hook nests a new Scope with that tenant set so
 * downstream use cases see it via `ScopeStore.require()`.
 *
 * When the header is absent, this is a no-op — the base Scope stays. Use
 * cases that require a tenant (e.g. CreateLastMileFulfilment) return
 * `TENANT_REQUIRED` in that case.
 *
 * TODO(auth): replace header-based extraction with OIDC-token-driven tenant
 * resolution once real auth is wired. Header is adequate for dev + e2e.
 *
 * Called directly (not as a Fastify plugin) so the hook registers against the
 * root instance, applying to every route rather than only a plugin's child
 * context.
 */
export function registerTenantScopeHook(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', (req, _reply, done) => {
    const base = ScopeStore.get();
    if (!base) {
      done();
      return;
    }

    const header = req.headers['x-tenant-id'];
    if (typeof header !== 'string' || header.length === 0) {
      done();
      return;
    }

    const augmented: Scope = {
      ...base,
      tenant: { tenantId: header },
    };
    ScopeStore.run(augmented, done);
  });
}
