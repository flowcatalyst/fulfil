// Atomic permissions for the LastMile subdomain. Each use case checks exactly
// one of these. Role → permission mappings are seeded but customisable per
// tenant; the list below grows as new use cases earn permissions.
export const LastMilePermission = {
  CreateLastMileFulfilment: 'createLastMileFulfilment',
  CancelLastMileFulfilment: 'cancelLastMileFulfilment',
  PlanLastMileFulfilment: 'planLastMileFulfilment',
  AssignShipment: 'assignShipment',
  ReassignShipment: 'reassignShipment',
  AbortShipment: 'abortShipment',
  ConfirmPickup: 'confirmPickup',
  ConfirmDelivery: 'confirmDelivery',
  ReportDeliveryFailure: 'reportDeliveryFailure',
} as const;
export type LastMilePermission =
  (typeof LastMilePermission)[keyof typeof LastMilePermission];

// Role names are conventional bundles, not a code-enforced hierarchy.
// Controllers do day-to-day operations; dispatchers focus on planning/assignment;
// supervisors aggregate everything plus abort/escalate; drivers only touch
// pickup/delivery confirmation; read-only is self-explanatory.
export const LastMileRole = {
  Controller: 'lastmileController',
  Dispatcher: 'lastmileDispatcher',
  Supervisor: 'lastmileSupervisor',
  Driver: 'lastmileDriver',
  ReadOnly: 'lastmileReadOnly',
} as const;
export type LastMileRole = (typeof LastMileRole)[keyof typeof LastMileRole];

// Default role → permission mapping. Seeded on tenant provisioning; customisable
// at runtime via tenant config. Not treated as source of truth at authorization time.
export const DefaultRolePermissions: Readonly<
  Record<LastMileRole, readonly LastMilePermission[]>
> = {
  [LastMileRole.Controller]: [
    LastMilePermission.CreateLastMileFulfilment,
    LastMilePermission.CancelLastMileFulfilment,
    LastMilePermission.PlanLastMileFulfilment,
    LastMilePermission.AssignShipment,
    LastMilePermission.ReassignShipment,
    LastMilePermission.ConfirmPickup,
    LastMilePermission.ConfirmDelivery,
    LastMilePermission.ReportDeliveryFailure,
  ],
  [LastMileRole.Dispatcher]: [
    LastMilePermission.PlanLastMileFulfilment,
    LastMilePermission.AssignShipment,
    LastMilePermission.ReassignShipment,
  ],
  [LastMileRole.Supervisor]: [
    LastMilePermission.CreateLastMileFulfilment,
    LastMilePermission.CancelLastMileFulfilment,
    LastMilePermission.PlanLastMileFulfilment,
    LastMilePermission.AssignShipment,
    LastMilePermission.ReassignShipment,
    LastMilePermission.AbortShipment,
    LastMilePermission.ConfirmPickup,
    LastMilePermission.ConfirmDelivery,
    LastMilePermission.ReportDeliveryFailure,
  ],
  [LastMileRole.Driver]: [
    LastMilePermission.ConfirmPickup,
    LastMilePermission.ConfirmDelivery,
    LastMilePermission.ReportDeliveryFailure,
  ],
  [LastMileRole.ReadOnly]: [],
};
