import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { ScopeStore, type Scope } from '@fulfil/framework';

/**
 * Nest a tenant-augmented Scope onto the AsyncLocalStorage for the request.
 *
 * The framework plugin sets a base Scope (`executionId`, `correlationId`,
 * `principalId`, etc.) with `tenant: null`. This plugin runs immediately after
 * and, if the request carries an `x-tenant-id` header, nests a new Scope with
 * that tenant set. Nested `ScopeStore.run(...)` means the inner (tenant-aware)
 * Scope is what use cases see via `ScopeStore.require()`.
 *
 * When the header is absent, this plugin is a no-op — the base Scope stays.
 * Downstream use cases that require a tenant (e.g. CreateLastMileFulfilment)
 * return a validation error in that case.
 *
 * TODO(auth): replace the header-based extraction with OIDC-token-driven
 * tenant resolution once real auth is wired. Header is fine for dev + e2e.
 */
async function tenantScopePlugin(fastify: FastifyInstance): Promise<void> {
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

export const tenantScopeFastifyPlugin = fp(tenantScopePlugin, {
  name: '@fulfil/server/tenant-scope',
  fastify: '5.x',
  dependencies: ['@fulfil/framework'],
});
