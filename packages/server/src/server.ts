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

async function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Framework plugin: scope propagation, SLA tracking, Prometheus metrics
  await server.register(frameworkFastifyPlugin, {
    slaTracker: createSlaTracker([]),
    slaSampleRepository: createDrizzleSlaSampleRepository(db),
    extractRequestToken: (req) => {
      // TODO: extract from OIDC token once auth middleware is added
      const sub = req.headers['x-user-id'];
      if (typeof sub !== 'string') return null;
      return { sub };
    },
  });

  await server.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Fulfil Logistics API',
        version: '0.0.1',
      },
    },
  });

  await server.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  // Health check
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
