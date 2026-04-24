import type { Scope } from '@fulfil/framework';

export const SystemIdentity = {
  SCHEDULER: { principalId: 'system:scheduler' },
} as const;

export interface ScheduledTaskDefinition {
  readonly name: string;
  readonly schedule: string;
  readonly identity: { readonly principalId: string };
  readonly handler: (scope: Scope) => Promise<void>;
}
