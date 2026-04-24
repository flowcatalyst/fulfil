import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { Scope } from '../scope/scope.js';
import { ScopeStore } from '../scope/scope-store.js';
import { metrics, getMetricsRegistry } from '../measurements/prometheus.js';
import type { SlaTracker } from '../measurements/sla-tracker.js';
import type { SlaSampleRepository } from '../measurements/sla-sample.js';
import type { RequestToken } from '../scope/scope.js';
import './route-sla.js';

export interface FrameworkPluginOptions {
  readonly slaTracker: SlaTracker;
  readonly slaSampleRepository: SlaSampleRepository;
  /**
   * Extract the OIDC request token from the incoming request.
   * Return null for unauthenticated / public routes.
   */
  readonly extractRequestToken: (req: FastifyRequest) => RequestToken | null;
}

async function frameworkPlugin(
  fastify: FastifyInstance,
  options: FrameworkPluginOptions,
): Promise<void> {
  const { slaTracker, slaSampleRepository, extractRequestToken } = options;

  // onRequest: create scope and run the rest of the request lifecycle within it
  fastify.addHook('onRequest', (req, _reply, done) => {
    const token = extractRequestToken(req);

    const route = req.routeOptions?.url ?? req.url;
    const captureSql =
      slaTracker.shouldCaptureSql(route) ||
      req.headers['x-sql-trace'] === 'true';

    if (token) {
      const scope = Scope.fromRequest(token, { captureSql });
      ScopeStore.run(scope, done);
    } else {
      done();
    }
  });

  // onSend: finish measurement, run SLA tracking, record Prometheus metrics
  fastify.addHook('onSend', async (req, reply) => {
    const scope = ScopeStore.get();
    const route = req.routeOptions?.url ?? req.url;
    const method = req.method;
    const statusCode = String(reply.statusCode);
    const durationMs = scope?.measurement.finish().durationMs ?? 0;

    metrics.httpDuration.observe({ method, route, status_code: statusCode }, durationMs);

    if (scope) {
      const slaConfig = req.routeOptions?.config?.['sla'] as
        | { thresholdMs: number }
        | undefined;

      if (slaConfig) {
        const sample = slaTracker.record(route, durationMs, scope);
        if (sample) {
          metrics.slaBreach.inc({ route });
          await slaSampleRepository.save(sample).catch(() => {
            // Non-fatal: log but don't fail the response
            req.log.error({ route, correlationId: scope.correlationId }, 'Failed to persist SLA sample');
          });
        }
      }
    }
  });

  // GET /metrics: Prometheus metrics endpoint
  fastify.get('/metrics', async (_req, reply) => {
    const output = await getMetricsRegistry().metrics();
    await reply
      .header('Content-Type', getMetricsRegistry().contentType)
      .send(output);
  });
}

export const frameworkFastifyPlugin = fp(frameworkPlugin, {
  name: '@fulfil/framework',
  fastify: '5.x',
});
