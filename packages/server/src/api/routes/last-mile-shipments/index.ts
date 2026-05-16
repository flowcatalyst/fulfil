import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../../app-context.js';
import { registerCreateLastMileShipmentRoute } from './create-last-mile-shipment.route.js';
import { registerMarkShipmentReadyRoute } from './mark-shipment-ready.route.js';

export interface LastMileShipmentRoutesOptions {
  readonly appContext: AppContext;
}

export async function lastMileShipmentRoutesPlugin(
  fastify: FastifyInstance,
  opts: LastMileShipmentRoutesOptions,
): Promise<void> {
  registerCreateLastMileShipmentRoute(fastify, opts.appContext);
  registerMarkShipmentReadyRoute(fastify, opts.appContext);
}
