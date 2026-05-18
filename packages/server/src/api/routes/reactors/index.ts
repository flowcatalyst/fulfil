import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../../app-context.js';
import {
  flowcatalystWebhookAuthHook,
  type WebhookAuthHookOptions,
} from '../../plugins/flowcatalyst-webhook-auth.js';
import { registerLastMileFulfilmentCreatedReactorRoute } from './last-mile-fulfilment-created.route.js';
import { registerLastMileShipmentCreatedReactorRoute } from './last-mile-shipment-created.route.js';

export interface ReactorRoutesOptions {
  readonly appContext: AppContext;
  readonly webhookAuth: WebhookAuthHookOptions;
}

/**
 * Reactor route plugin. Hosts all inbound-webhook routes that FlowCatalyst
 * calls to trigger Fulfil-side reactors. Subscriptions are sync'd to point
 * at these URLs via the FlowCatalyst sync script.
 *
 * The HMAC verification hook is registered at the plugin scope, so every
 * reactor route below inherits it — webhook auth is mandatory unless
 * `FLOWCATALYST_SIGNING_SECRET` is unset (dev mode; the hook logs + skips).
 */
export async function reactorRoutesPlugin(
  fastify: FastifyInstance,
  opts: ReactorRoutesOptions,
): Promise<void> {
  fastify.addHook('preHandler', flowcatalystWebhookAuthHook(opts.webhookAuth));

  registerLastMileFulfilmentCreatedReactorRoute(fastify, opts.appContext);
  registerLastMileShipmentCreatedReactorRoute(fastify, opts.appContext);
}
