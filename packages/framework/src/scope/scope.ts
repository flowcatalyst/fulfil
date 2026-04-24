import { generateTsid } from '@flowcatalyst/sdk';
import type { TenantContext } from './contexts/tenant-context.js';
import { type MeasurementContext, createMeasurementContext } from './contexts/measurement-context.js';
import { type SqlAuditContext, SqlAuditContext as SqlAuditContextFactory } from './contexts/sql-audit-context.js';

const PRINCIPAL_TYPES = {
  USER: 'USER',
  SERVICE: 'SERVICE',
} as const;

type PrincipalType = (typeof PRINCIPAL_TYPES)[keyof typeof PRINCIPAL_TYPES];

export interface Scope {
  readonly executionId: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly principalId: string;
  readonly principalType: PrincipalType;
  readonly initiatedAt: Date;

  readonly tenant: TenantContext | null;
  readonly measurement: MeasurementContext;
  readonly sqlAudit: SqlAuditContext;
}

export interface RequestToken {
  readonly sub: string;
  readonly correlationId?: string | undefined;
  readonly causationId?: string | null;
}

export interface RequestScopeOptions {
  readonly tenant?: TenantContext;
  readonly captureSql?: boolean;
}

export interface TaskIdentity {
  readonly principalId: string;
}

export interface ParentEvent {
  readonly correlationId: string;
  readonly eventId: string;
}

function fromRequest(token: RequestToken, options: RequestScopeOptions = {}): Scope {
  return {
    executionId: generateTsid(),
    correlationId: token.correlationId ?? generateTsid(),
    causationId: token.causationId ?? null,
    principalId: token.sub,
    principalType: PRINCIPAL_TYPES.USER,
    initiatedAt: new Date(),
    tenant: options.tenant ?? null,
    measurement: createMeasurementContext(),
    sqlAudit: options.captureSql
      ? SqlAuditContextFactory.capturing()
      : SqlAuditContextFactory.inactive(),
  };
}

function forScheduledTask(identity: TaskIdentity): Scope {
  return {
    executionId: generateTsid(),
    correlationId: generateTsid(),
    causationId: null,
    principalId: identity.principalId,
    principalType: PRINCIPAL_TYPES.SERVICE,
    initiatedAt: new Date(),
    tenant: null,
    measurement: createMeasurementContext(),
    sqlAudit: SqlAuditContextFactory.inactive(),
  };
}

function fromParentEvent(parentEvent: ParentEvent, identity: TaskIdentity): Scope {
  return {
    executionId: generateTsid(),
    correlationId: parentEvent.correlationId,
    causationId: parentEvent.eventId,
    principalId: identity.principalId,
    principalType: PRINCIPAL_TYPES.SERVICE,
    initiatedAt: new Date(),
    tenant: null,
    measurement: createMeasurementContext(),
    sqlAudit: SqlAuditContextFactory.inactive(),
  };
}

export const Scope = {
  fromRequest,
  forScheduledTask,
  fromParentEvent,
} as const;
