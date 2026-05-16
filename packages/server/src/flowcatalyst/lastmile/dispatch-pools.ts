import type { sync } from '@flowcatalyst/sdk';

/**
 * Dispatch pools Fulfil uses for outbound deliveries (subscriptions +
 * dispatch jobs). One pool per nominal latency class — the platform
 * segregates throughput per pool so a slow downstream can't starve a fast
 * one.
 *
 * v1 ships a single `fulfil-default` pool tuned to platform defaults. Add
 * `fulfil-slow` (for external integrations like Pinpoint) once those
 * appear.
 */
export const dispatchPools: readonly sync.DispatchPoolDefinition[] = [
  {
    code: 'fulfil-default',
    name: 'Fulfil Default',
    description:
      'Default pool for Fulfil-emitted dispatches: reactor webhooks, intra-domain shipment creation, audit fan-out.',
    concurrency: 10,
    rateLimit: 100,
  },
];
