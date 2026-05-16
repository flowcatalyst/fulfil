import { sync } from '@flowcatalyst/sdk';
import { lastMileEventTypes } from './lastmile/events.js';
import { lastMileSubscriptions } from './lastmile/subscriptions.js';
import { lastMileRoles } from './lastmile/roles.js';
import { dispatchPools } from './lastmile/dispatch-pools.js';

/**
 * Application code on the FlowCatalyst platform. Matches Fulfil's outbox
 * `clientId` so events and audit logs route under the same identity.
 */
export const FULFIL_APPLICATION_CODE = 'fulfil';

export interface FlowCatalystDefinitionsConfig {
  /** Public base URL for subscription targets (must be reachable from FC). */
  readonly publicBaseUrl: string;
  /** Dispatch pool code Fulfil's subscriptions use. */
  readonly dispatchPoolCode?: string;
}

/**
 * Compose the Fulfil application's FlowCatalyst definition set.
 *
 * Pass to `client.definitions().sync(...)` from the sync script. Sync is a
 * CI/CD step — NOT an app startup step. Running it from a live server creates
 * races between replicas and wastes load.
 */
export function buildFulfilDefinitions(
  config: FlowCatalystDefinitionsConfig,
): sync.DefinitionSet {
  const dispatchPoolCode = config.dispatchPoolCode ?? 'fulfil-default';
  return sync
    .defineApplication(FULFIL_APPLICATION_CODE)
    .withEventTypes([...lastMileEventTypes])
    .withSubscriptions([
      ...lastMileSubscriptions(config.publicBaseUrl, dispatchPoolCode),
    ])
    .withDispatchPools([...dispatchPools])
    .withRoles([...lastMileRoles])
    .build();
}
