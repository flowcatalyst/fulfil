/**
 * scripts/sync-flowcatalyst.ts
 *
 * Sync Fulfil's application definitions (event types, subscriptions, dispatch
 * pools, roles) to the FlowCatalyst control plane.
 *
 * Run via `pnpm flowcatalyst:sync` — typically from CI/CD after migrations
 * and before the live cutover. Do NOT run on every app boot: sync races
 * between replicas and wastes platform load.
 *
 * Required env:
 *   FLOWCATALYST_URL            — platform base URL
 *   FLOWCATALYST_CLIENT_ID      — OAuth client id (also Fulfil's outbox clientId)
 *   FLOWCATALYST_CLIENT_SECRET  — OAuth client secret
 *   FULFIL_PUBLIC_BASE_URL      — public URL of this Fulfil instance
 *
 * Optional env:
 *   FULFIL_DISPATCH_POOL          — defaults to `fulfil-default`
 *   FLOWCATALYST_REMOVE_UNLISTED  — `"true"` to delete SDK-sourced rows missing from this set
 */

import { FlowCatalystClient } from '@flowcatalyst/sdk';
import { buildFulfilDefinitions } from '../src/flowcatalyst/index.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const baseUrl = requireEnv('FLOWCATALYST_URL');
  const clientId = requireEnv('FLOWCATALYST_CLIENT_ID');
  const clientSecret = requireEnv('FLOWCATALYST_CLIENT_SECRET');
  const publicBaseUrl = requireEnv('FULFIL_PUBLIC_BASE_URL');
  const dispatchPoolCode = process.env['FULFIL_DISPATCH_POOL'] ?? 'fulfil-default';
  const removeUnlisted = process.env['FLOWCATALYST_REMOVE_UNLISTED'] === 'true';

  const client = new FlowCatalystClient({
    baseUrl,
    clientId,
    clientSecret,
  });

  const definitions = buildFulfilDefinitions({
    publicBaseUrl,
    dispatchPoolCode,
  });

  console.log(
    `Syncing Fulfil definitions to ${baseUrl} (removeUnlisted=${removeUnlisted})…`,
  );

  const result = await client.definitions().sync(definitions, {
    removeUnlisted,
  });

  result.match(
    (r) => {
      console.log(`Synced application: ${r.applicationCode}`);
      console.log(JSON.stringify(r, null, 2));
    },
    (err) => {
      console.error('Sync failed:', err);
      process.exit(1);
    },
  );
}

main().catch((err: unknown) => {
  console.error('Sync script crashed:', err);
  process.exit(1);
});
