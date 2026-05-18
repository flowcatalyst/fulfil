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
import { lastMileShipmentRoutesPlugin } from './api/routes/last-mile-shipments/index.js';
import { processRoutesPlugin } from './api/routes/processes/index.js';
import { LastMileFulfilmentCreatedEventDataSchema } from './api/schemas/lastmile/events/last-mile-fulfilment-created.schema.js';
import { LastMileShipmentCreatedEventDataSchema } from './api/schemas/lastmile/events/last-mile-shipment-created.schema.js';
import { LastMileFulfilmentShipmentRequestedEventDataSchema } from './api/schemas/lastmile/events/last-mile-fulfilment-shipment-requested.schema.js';
import { LastMileFulfilmentShipmentLinkedEventDataSchema } from './api/schemas/lastmile/events/last-mile-fulfilment-shipment-linked.schema.js';
import { LastMileFulfilmentShipmentLinkDispatchedEventDataSchema } from './api/schemas/lastmile/events/last-mile-fulfilment-shipment-link-dispatched.schema.js';
import { LastMileShipmentReadyEventDataSchema } from './api/schemas/lastmile/events/last-mile-shipment-ready.schema.js';
import { LastMileFulfilmentAwaitingGeocodingEventDataSchema } from './api/schemas/lastmile/events/last-mile-fulfilment-awaiting-geocoding.schema.js';

async function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Capture raw JSON body on every request — the FlowCatalyst webhook auth
  // hook needs it for HMAC verification. Replaces Fastify's default JSON
  // parser; cost is one extra Buffer→string conversion per request.
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      const text = body.toString('utf8');
      req.rawBody = text;
      if (text.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

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
  registerTenantScopeHook(server);

  // Register reusable TypeBox event-data schemas so they show up under
  // `components.schemas` in the generated OpenAPI document.
  server.addSchema(LastMileFulfilmentCreatedEventDataSchema);
  server.addSchema(LastMileShipmentCreatedEventDataSchema);
  server.addSchema(LastMileFulfilmentShipmentRequestedEventDataSchema);
  server.addSchema(LastMileFulfilmentShipmentLinkedEventDataSchema);
  server.addSchema(LastMileFulfilmentShipmentLinkDispatchedEventDataSchema);
  server.addSchema(LastMileShipmentReadyEventDataSchema);
  server.addSchema(LastMileFulfilmentAwaitingGeocodingEventDataSchema);

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
        {
          name: 'Processes',
          description:
            'Inbound webhooks for business processes. One webhook per process, subscribed to multiple event types; the webhook is a decider and emits dispatch jobs for each action.',
        },
      ],
    },
  });

  await server.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  // Composition root.
  const appContext = createAppContext({
    db,
    clientId: process.env['FLOWCATALYST_CLIENT_ID'] ?? 'fulfil',
    publicBaseUrl:
      process.env['FULFIL_PUBLIC_BASE_URL'] ?? 'http://localhost:3000',
    dispatchPoolCode:
      process.env['FULFIL_DISPATCH_POOL'] ?? 'fulfil-default',
  });

  // Webhook auth shared by every HMAC-verified route (process webhooks +
  // dispatch-target routes).
  const webhookAuth = {
    signingSecret: process.env['FLOWCATALYST_SIGNING_SECRET'],
  } as const;

  // Domain + process routes.
  await server.register(lastMileFulfilmentRoutesPlugin, {
    appContext,
    webhookAuth,
  });
  await server.register(lastMileShipmentRoutesPlugin, { appContext });
  await server.register(processRoutesPlugin, { appContext, webhookAuth });

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
