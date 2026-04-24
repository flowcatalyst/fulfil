import { usecase } from '@flowcatalyst/sdk';

// Scope
export { Scope, ScopeStore } from './scope/index.js';
export type {
  RequestToken,
  RequestScopeOptions,
  TaskIdentity,
  ParentEvent,
  TenantContext,
  MeasurementContext,
  CapturedQuery,
  SqlAuditContext,
} from './scope/index.js';

// Use case infrastructure — re-exported from @flowcatalyst/sdk's usecase namespace
// so consumers can continue importing from @fulfil/framework.
export const Result = usecase.Result;
export const isSuccess = usecase.isSuccess;
export const isFailure = usecase.isFailure;
export const UseCaseError = usecase.UseCaseError;
export const DomainEvent = usecase.DomainEvent;
export const BaseDomainEvent = usecase.BaseDomainEvent;
export const ExecutionContext = usecase.ExecutionContext;
export const SecuredUseCase = usecase.SecuredUseCase;
export const OutboxUnitOfWork = usecase.OutboxUnitOfWork;

export type Result<T> = usecase.Result<T>;
export type Success<T> = usecase.Success<T>;
export type Failure<T> = usecase.Failure<T>;
export type UseCaseError = usecase.UseCaseError;
export type UseCaseErrorBase = usecase.UseCaseErrorBase;
export type ValidationError = usecase.ValidationError;
export type NotFoundError = usecase.NotFoundError;
export type BusinessRuleViolation = usecase.BusinessRuleViolation;
export type ConcurrencyError = usecase.ConcurrencyError;
export type AuthorizationError = usecase.AuthorizationError;
export type InfrastructureError = usecase.InfrastructureError;
export type DomainEvent = usecase.DomainEvent;
export type DomainEventBase = usecase.DomainEventBase;
export type ExecutionContext = usecase.ExecutionContext;
export type Command = usecase.Command;
export type UseCase<TCommand extends usecase.Command, TEvent extends usecase.DomainEvent> =
  usecase.UseCase<TCommand, TEvent>;
export type Aggregate = usecase.Aggregate;
export type UnitOfWork = usecase.UnitOfWork;
export type OutboxUnitOfWorkConfig = usecase.OutboxUnitOfWorkConfig;
export type OutboxUnitOfWorkOptions = usecase.OutboxUnitOfWorkOptions;

// Audit log
export type { AuditLog, CreateAuditLogData } from './audit/audit-log.js';

// Logging
export { createContextLogger } from './logging/logger.js';

// Jobs
export type { JobDescriptor } from './jobs/job-descriptor.js';
export { runJob } from './jobs/run-job.js';

// Cache
export type { CacheStore, TaggedCacheStore, CacheManager } from './cache/index.js';
export { createCacheManager, createArrayStore, createRedisStore } from './cache/index.js';
export type { RedisStoreConfig, RedisClient } from './cache/index.js';

// Measurements
export type { RouteSlaDef, SlaTracker } from './measurements/sla-tracker.js';
export { createSlaTracker } from './measurements/sla-tracker.js';
export type { SlaSample, SlaSampleRepository } from './measurements/sla-sample.js';
export { ScopeAwareDrizzleLogger } from './measurements/drizzle-logger.js';
export { metrics, getMetricsRegistry } from './measurements/prometheus.js';

// Notices
export type { Notice, CreateNotice, NoticeLevel } from './notices/notice.js';
export type { NoticeRepository } from './notices/notice-repository.js';
export type { NoticeService, NoticeServiceOptions } from './notices/notice-service.js';
export { createNoticeService } from './notices/notice-service.js';

// HTTP plugin
export { frameworkFastifyPlugin } from './http/fastify-plugin.js';
export type { FrameworkPluginOptions } from './http/fastify-plugin.js';
export type { RouteSlaOptions } from './http/route-sla.js';
