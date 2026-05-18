import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../../app-context.js';
import {
  flowcatalystWebhookAuthHook,
  type WebhookAuthHookOptions,
} from '../../plugins/flowcatalyst-webhook-auth.js';
import { registerLastMileFulfilmentProcessRoute } from './last-mile-fulfilment.route.js';

export interface ProcessRoutesOptions {
  readonly appContext: AppContext;
  readonly webhookAuth: WebhookAuthHookOptions;
}

/**
 * Process route plugin. Hosts every `/processes/*` webhook — one per
 * business process, each subscribed to multiple event types via a single
 * FlowCatalyst subscription with `eventTypes: [...]`.
 *
 * HMAC verification is registered at the plugin scope so every process
 * webhook inherits it.
 */
export async function processRoutesPlugin(
  fastify: FastifyInstance,
  opts: ProcessRoutesOptions,
): Promise<void> {
  fastify.addHook('preHandler', flowcatalystWebhookAuthHook(opts.webhookAuth));

  registerLastMileFulfilmentProcessRoute(fastify, opts.appContext);
}
