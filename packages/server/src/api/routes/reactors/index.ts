import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../../app-context.js';
import { registerLastMileFulfilmentCreatedReactorRoute } from './last-mile-fulfilment-created.route.js';
import { registerLastMileShipmentCreatedReactorRoute } from './last-mile-shipment-created.route.js';

export interface ReactorRoutesOptions {
  readonly appContext: AppContext;
}

/**
 * Reactor route plugin. Hosts all inbound-webhook routes that FlowCatalyst
 * calls to trigger Fulfil-side reactors. Subscriptions are sync'd to point
 * at these URLs via the FlowCatalyst sync script.
 */
export async function reactorRoutesPlugin(
  fastify: FastifyInstance,
  opts: ReactorRoutesOptions,
): Promise<void> {
  registerLastMileFulfilmentCreatedReactorRoute(fastify, opts.appContext);
  registerLastMileShipmentCreatedReactorRoute(fastify, opts.appContext);
}
