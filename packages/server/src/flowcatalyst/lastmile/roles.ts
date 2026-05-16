import type { sync } from '@flowcatalyst/sdk';

/**
 * Roles + permissions Fulfil declares for the LastMile subdomain.
 *
 * Platform-side permission codes follow `<domain>:<area>:<resource>:<action>`.
 * The TypeScript-side `LastMilePermission` catalog (in `@fulfil/shared`)
 * stores the codes that use cases compare against at authorize time; the
 * platform-side names below are what get sync'd. Real authz binding (token →
 * role → permission check) is a future slice — this just gets the names onto
 * the platform.
 *
 * Roles are stored as `fulfil:<name>` (the SDK prefixes them automatically).
 */
export const lastMileRoles: readonly sync.RoleDefinition[] = [
  {
    name: 'lastmile-controller',
    displayName: 'LastMile Controller',
    description:
      'Day-to-day controller: creates and cancels fulfilments, drives planning, confirms pickups/deliveries.',
    permissions: [
      'fulfil:lastmile:fulfilment:create',
      'fulfil:lastmile:fulfilment:cancel',
      'fulfil:lastmile:fulfilment:plan',
      'fulfil:lastmile:shipment:assign',
      'fulfil:lastmile:shipment:reassign',
      'fulfil:lastmile:shipment:mark-ready',
      'fulfil:lastmile:shipment:confirm-pickup',
      'fulfil:lastmile:shipment:confirm-delivery',
      'fulfil:lastmile:shipment:report-failure',
    ],
    clientManaged: true,
  },
  {
    name: 'lastmile-dispatcher',
    displayName: 'LastMile Dispatcher',
    description:
      'Focused on planning and assignment — does not create or cancel fulfilments.',
    permissions: [
      'fulfil:lastmile:fulfilment:plan',
      'fulfil:lastmile:shipment:assign',
      'fulfil:lastmile:shipment:reassign',
    ],
    clientManaged: true,
  },
  {
    name: 'lastmile-supervisor',
    displayName: 'LastMile Supervisor',
    description:
      'Controller permissions + abort/escalate authority.',
    permissions: ['fulfil:lastmile:*:*'],
    clientManaged: true,
  },
  {
    name: 'lastmile-driver',
    displayName: 'LastMile Driver',
    description:
      'Driver app actions only — pickup/delivery confirmation and failure reporting.',
    permissions: [
      'fulfil:lastmile:shipment:confirm-pickup',
      'fulfil:lastmile:shipment:confirm-delivery',
      'fulfil:lastmile:shipment:report-failure',
    ],
    clientManaged: true,
  },
  {
    name: 'lastmile-readonly',
    displayName: 'LastMile Read-Only',
    description:
      'View access to LastMile aggregates — no write permissions.',
    permissions: [],
    clientManaged: true,
  },
];
