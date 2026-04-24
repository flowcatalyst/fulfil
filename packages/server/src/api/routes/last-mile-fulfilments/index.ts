import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../../app-context.js';
import { registerCreateLastMileFulfilmentRoute } from './create-last-mile-fulfilment.route.js';

export interface LastMileFulfilmentRoutesOptions {
  readonly appContext: AppContext;
}

/**
 * Plain async Fastify plugin — encapsulates all last-mile routes. Registered
 * with `server.register(lastMileFulfilmentRoutesPlugin, { appContext })`.
 */
export async function lastMileFulfilmentRoutesPlugin(
  fastify: FastifyInstance,
  opts: LastMileFulfilmentRoutesOptions,
): Promise<void> {
  registerCreateLastMileFulfilmentRoute(
    fastify,
    opts.appContext.useCases.createLastMileFulfilment,
  );
}
