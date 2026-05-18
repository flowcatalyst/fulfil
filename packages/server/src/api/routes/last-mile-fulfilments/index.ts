import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../../app-context.js';
import type { WebhookAuthHookOptions } from '../../plugins/flowcatalyst-webhook-auth.js';
import { registerCreateLastMileFulfilmentRoute } from './create-last-mile-fulfilment.route.js';
import { registerLinkShipmentToFulfilmentRoute } from './link-shipment-to-fulfilment.route.js';

export interface LastMileFulfilmentRoutesOptions {
  readonly appContext: AppContext;
  /** Used by HMAC-verified dispatch-target routes mounted under this plugin. */
  readonly webhookAuth: WebhookAuthHookOptions;
}

/**
 * Plain async Fastify plugin — encapsulates all last-mile fulfilment
 * routes (user-facing + dispatch targets). HMAC auth is applied per-route
 * to the dispatch-target subset (currently just `/link-shipment`).
 */
export async function lastMileFulfilmentRoutesPlugin(
  fastify: FastifyInstance,
  opts: LastMileFulfilmentRoutesOptions,
): Promise<void> {
  registerCreateLastMileFulfilmentRoute(fastify, opts.appContext);
  registerLinkShipmentToFulfilmentRoute(
    fastify,
    opts.appContext,
    opts.webhookAuth,
  );
}
