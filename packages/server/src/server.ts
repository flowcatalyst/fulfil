import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  frameworkFastifyPlugin,
  createSlaTracker,
} from '@fulfil/framework';
import { db } from './infrastructure/db.js';
import { createDrizzleSlaSampleRepository } from './infrastructure/sla-sample-repository.js';
import { registerScheduledTasks, scheduledTasks } from './scheduling/index.js';
import { createAppContext } from './app-context.js';
import { registerTenantScopeHook } from './api/hooks/tenant-scope.hook.js';
import { lastMileFulfilmentRoutesPlugin } from './api/routes/last-mile-fulfilments/index.js';
import { LastMileFulfilmentCreatedEventDataSchema } from './api/schemas/lastmile/events/last-mile-fulfilment-created.schema.js';

async function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Framework plugin: scope propagation, SLA tracking, Prometheus metrics.
  await server.register(frameworkFastifyPlugin, {
    slaTracker: createSlaTracker([]),
    slaSampleRepository: createDrizzleSlaSampleRepository(db),
    extractRequestToken: (req) => {
      // TODO(auth): extract from OIDC token once real auth middleware is added.
      const sub = req.headers['x-user-id'];
      if (typeof sub !== 'string') return null;
      return { sub };
    },
  });

  // Nest tenant context onto the Scope ALS for requests carrying `x-tenant-id`.
  // Must run after the framework plugin's onRequest (which sets the base Scope).
  registerTenantScopeHook(server);

  // Register reusable TypeBox schemas so they show up under
  // `components.schemas` in the generated OpenAPI document.
  server.addSchema(LastMileFulfilmentCreatedEventDataSchema);

  await server.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Fulfil Logistics API',
        version: '0.0.1',
      },
      tags: [
        {
          name: 'LastMile',
          description:
            'Last-mile fulfilment aggregates and shipments. One fulfilment per upstream source note; shipments are created by planning.',
        },
      ],
    },
  });

  await server.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  // Composition root — repositories, UnitOfWork, use cases, aggregate registry.
  const appContext = createAppContext({
    db,
    clientId: process.env['FLOWCATALYST_CLIENT_ID'] ?? 'fulfil-server',
  });

  // Domain route plugins.
  await server.register(lastMileFulfilmentRoutesPlugin, { appContext });

  // Health check.
  server.get('/health', async () => ({ status: 'ok' }));

  return server;
}


async function start(): Promise<void> {
  const server = await buildServer();

  const host = process.env['HOST'] ?? '0.0.0.0';
  const port = Number(process.env['PORT'] ?? 3000);

  registerScheduledTasks(scheduledTasks, server.log);

  await server.listen({ host, port });
  server.log.info(`Server listening on ${host}:${port}`);
}

start().catch((error: unknown) => {
  const fallbackLogger = Fastify({ logger: true }).log;
  fallbackLogger.error(error, 'Server failed to start');
  process.exit(1);
});
