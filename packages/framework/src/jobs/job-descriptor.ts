import type { TenantContext } from '../scope/contexts/tenant-context.js';

export interface JobDescriptor {
  readonly name: string;
  readonly identity: { readonly principalId: string };
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly tenant?: TenantContext;
  readonly sqlSampling?: boolean;
}
