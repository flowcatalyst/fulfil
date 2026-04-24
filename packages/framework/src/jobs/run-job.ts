import { generateTsid } from '@flowcatalyst/sdk';
import { Scope } from '../scope/scope.js';
import { ScopeStore } from '../scope/scope-store.js';
import { SqlAuditContext } from '../scope/contexts/sql-audit-context.js';
import { createMeasurementContext } from '../scope/contexts/measurement-context.js';
import type { JobDescriptor } from './job-descriptor.js';

export async function runJob<T>(
  descriptor: JobDescriptor,
  fn: (scope: Scope) => Promise<T>,
): Promise<T> {
  const scope: Scope = {
    executionId: generateTsid(),
    correlationId: descriptor.correlationId ?? generateTsid(),
    causationId: descriptor.causationId ?? null,
    principalId: descriptor.identity.principalId,
    principalType: 'SERVICE',
    initiatedAt: new Date(),
    tenant: descriptor.tenant ?? null,
    measurement: createMeasurementContext(),
    sqlAudit: descriptor.sqlSampling
      ? SqlAuditContext.capturing()
      : SqlAuditContext.inactive(),
  };

  return ScopeStore.run(scope, () => fn(scope));
}
