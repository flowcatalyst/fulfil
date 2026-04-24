import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { AppContext } from '../../../app-context.js';
import { registerCreateLastMileFulfilmentRoute } from './create-last-mile-fulfilment.route.js';

export interface LastMileFulfilmentRoutesOptions {
  readonly appContext: AppContext;
}

async function lastMileFulfilmentRoutes(
  fastify: FastifyInstance,
  opts: LastMileFulfilmentRoutesOptions,
): Promise<void> {
  registerCreateLastMileFulfilmentRoute(
    fastify,
    opts.appContext.useCases.createLastMileFulfilment,
  );
}

export const lastMileFulfilmentRoutesPlugin = fp(lastMileFulfilmentRoutes, {
  name: '@fulfil/server/lastmile-routes',
  fastify: '5.x',
});
