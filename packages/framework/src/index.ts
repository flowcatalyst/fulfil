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

// Use-case primitives — re-exported from @flowcatalyst/sdk's Effect surface.
// Single source of truth is the SDK; framework re-exports so consumers can keep
// importing from @fulfil/framework.
export {
  UnitOfWork,
  ExecutionContext,
  ValidationError,
  NotFoundError,
  BusinessRuleViolation,
  ConcurrencyError,
  AuthorizationError,
  InfrastructureError,
  httpStatus,
  DomainEvent,
  BaseDomainEvent,
  OutboxUnitOfWork,
  TestUnitOfWork,
} from '@flowcatalyst/sdk/effect/usecase';
export type {
  Sealed,
  UseCaseError,
  Command,
  UseCase,
  Aggregate,
  DomainEventBase,
} from '@flowcatalyst/sdk/effect/usecase';

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
