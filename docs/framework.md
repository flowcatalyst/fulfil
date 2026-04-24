# @fulfil/framework

Reusable platform infrastructure for the Fulfil server. Provides scope propagation, use-case patterns, domain events, caching, SLA tracking, observability, and notice capture.

---

## Contents

- [Installation & setup](#installation--setup)
- [Scope](#scope)
- [Result & UseCaseError](#result--usecaseerror)
- [Domain events](#domain-events)
- [Unit of Work](#unit-of-work)
- [Use case pattern](#use-case-pattern)
- [Jobs & scheduled tasks](#jobs--scheduled-tasks)
- [Cache](#cache)
- [SLA tracking & SQL sampling](#sla-tracking--sql-sampling)
- [Prometheus metrics](#prometheus-metrics)
- [Notice service](#notice-service)
- [Fastify plugin](#fastify-plugin)
- [Logging](#logging)

---

## Installation & setup

The package is already wired into `packages/server`. After changes to framework source, rebuild before typechecking the server:

```bash
pnpm --filter @fulfil/framework build
pnpm typecheck
```

Register the Fastify plugin once at server startup. See [Fastify plugin](#fastify-plugin).

---

## Scope

`Scope` is the unified execution context. It carries identity, tracing, and per-request contextual state. It is propagated automatically via `AsyncLocalStorage` — no parameter drilling required.

```typescript
interface Scope {
  readonly executionId: string;       // unique per use-case execution
  readonly correlationId: string;     // preserved across service boundaries
  readonly causationId: string | null;
  readonly principalId: string;
  readonly principalType: 'USER' | 'SERVICE';
  readonly initiatedAt: Date;

  readonly tenant: TenantContext | null;
  readonly measurement: MeasurementContext;
  readonly sqlAudit: SqlAuditContext;
}
```

### Creating scopes

Scopes are created at entry points. Application code never constructs them directly.

**HTTP requests** — handled by the Fastify plugin automatically (see [Fastify plugin](#fastify-plugin)).

**Scheduled tasks** — use `runJob` inside `registerScheduledTasks`:

```typescript
const task: ScheduledTaskDefinition = {
  name: 'cleanup-expired-holds',
  schedule: '0 */6 * * *',
  identity: SystemIdentity.SCHEDULER,
  handler: async (scope) => {
    // scope is already available here
    await cleanupExpiredHolds(scope);
  },
};
```

**Event-driven handlers** — use `runJob` with a parent event:

```typescript
import { runJob } from '@fulfil/framework';

await runJob(
  {
    name: 'process-payment-event',
    identity: { principalId: 'system:payment-processor' },
    correlationId: incomingEvent.correlationId,
    causationId: incomingEvent.eventId,
  },
  async (scope) => {
    await processPayment(scope);
  },
);
```

### Reading the scope

Any code that needs the current scope reads it from `ScopeStore`:

```typescript
import { ScopeStore } from '@fulfil/framework';

// Returns Scope | undefined — use when scope may not exist (e.g. background init code)
const scope = ScopeStore.get();

// Returns Scope or throws — use in operations that always run within a scope
const scope = ScopeStore.require();
```

### Tenant context

Tenant is `null` for service/system scopes. For multi-tenant request scopes, pass it when extracting the token in the Fastify plugin:

```typescript
extractRequestToken: (req) => ({
  sub: token.sub,
  correlationId: req.headers['x-correlation-id'] as string | undefined,
}),
// Tenant can be added via RequestScopeOptions once tenant resolution is implemented
```

---

## Result & UseCaseError

Use cases never throw for business logic. They return `Result<T>`, a discriminated union of `Success<T>` and `Failure<UseCaseError>`.

### Checking results

```typescript
import { Result, isSuccess, isFailure } from '@fulfil/framework';

const result = await createOrderUseCase.execute(command, scope);

if (isFailure(result)) {
  // result.error is UseCaseError — map to HTTP status in route handlers
  return reply.status(UseCaseError.httpStatus(result.error)).send({
    error: result.error.code,
    message: result.error.message,
  });
}

// result.value is the event T
const event = result.value;
```

Or pattern-match:

```typescript
return Result.match(
  result,
  (event) => reply.status(201).send({ id: event.getData().orderId }),
  (error) => reply.status(UseCaseError.httpStatus(error)).send({ error: error.code }),
);
```

### Creating failures

Use cases return `Result.failure()` for validation, business rule violations, etc:

```typescript
import { Result, UseCaseError } from '@fulfil/framework';

if (!isValidOrderType(command.type)) {
  return Result.failure(
    UseCaseError.validation('INVALID_ORDER_TYPE', `Unknown order type: ${command.type}`),
  );
}

if (order.status !== 'pending') {
  return Result.failure(
    UseCaseError.businessRule('ORDER_NOT_PENDING', 'Only pending orders can be confirmed'),
  );
}
```

### Error types and HTTP status

| Type | Factory | HTTP |
|---|---|---|
| `validation` | `UseCaseError.validation(code, message)` | 400 |
| `not_found` | `UseCaseError.notFound(code, message)` | 404 |
| `authorization` | `UseCaseError.authorization(code, message)` | 403 |
| `business_rule` | `UseCaseError.businessRule(code, message)` | 409 |
| `concurrency` | `UseCaseError.concurrency(code, message)` | 409 |

All factories accept an optional third `details` argument for structured context.

### Success is restricted

`Result.success()` requires a token only `UnitOfWork` holds. **Use cases cannot create success directly** — they must go through `unitOfWork.commit()`. This guarantees every state change emits a domain event.

---

## Domain events

Events are class instances extending `BaseDomainEvent<TData>`. They carry identity and tracing from the scope automatically.

### Defining an event

```typescript
import { BaseDomainEvent, DomainEvent, type Scope } from '@fulfil/framework';

interface OrderCreatedData {
  readonly orderId: string;
  readonly customerId: string;
  readonly totalCents: number;
}

export class OrderCreated extends BaseDomainEvent<OrderCreatedData> {
  constructor(scope: Scope, data: OrderCreatedData) {
    super(
      {
        eventType: DomainEvent.eventType('fulfil', 'logistics', 'order', 'created'),
        specVersion: '1.0',
        source: 'fulfil:logistics',
        subject: DomainEvent.subject('fulfil', 'order', data.orderId),
        messageGroup: DomainEvent.messageGroup('fulfil', 'order', data.orderId),
      },
      scope,
      data,
    );
  }
}
```

### Using an event in a use case

```typescript
const event = new OrderCreated(scope, { orderId: order.id, customerId, totalCents });
return this.unitOfWork.commit(order, event, command);
```

### Event naming helpers

```typescript
DomainEvent.eventType('fulfil', 'logistics', 'order', 'created')
// → 'fulfil:logistics:order:created'

DomainEvent.subject('fulfil', 'order', orderId)
// → 'fulfil.order.{orderId}'

DomainEvent.messageGroup('fulfil', 'order', orderId)
// → 'fulfil:order:{orderId}'
```

---

## Unit of Work

`UnitOfWork` is the only way to produce a `Success` result. It atomically:
1. Persists the aggregate via the `AggregateRegistry`
2. Writes the domain event to the outbox (same DB transaction)
3. Creates the audit log entry (same DB transaction)

### Methods

```typescript
interface UnitOfWork {
  // Persist or update one aggregate
  commit<T extends DomainEvent>(aggregate, event, command): Promise<Result<T>>;

  // Delete one aggregate
  commitDelete<T extends DomainEvent>(aggregate, event, command): Promise<Result<T>>;

  // Persist or update multiple aggregates
  commitAll<T extends DomainEvent>(aggregates, event, command): Promise<Result<T>>;

  // Custom operations (bulk inserts, cross-table writes)
  commitOperations<T extends DomainEvent>(event, command, (tx) => Promise<void>): Promise<Result<T>>;
}
```

### In tests

Use `createNoOpUnitOfWork()` from `packages/server/src/infrastructure/unit-of-work.ts`:

```typescript
const unitOfWork = createNoOpUnitOfWork();
const useCase = new CreateOrderUseCase(unitOfWork, orderRepository);
```

---

## Use case pattern

Every write operation is a use case. The structure is always:
1. Validate — return `Result.failure()` on invalid input
2. Load dependencies from repositories
3. Build aggregate and event
4. `return unitOfWork.commit(aggregate, event, command)`

```typescript
// create-order.command.ts
export interface CreateOrderCommand {
  readonly customerId: string;
  readonly items: readonly OrderItem[];
}

// create-order.use-case.ts
export class CreateOrderUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly customerRepository: CustomerRepository,
  ) {}

  async execute(
    command: CreateOrderCommand,
    scope: Scope,
  ): Promise<Result<OrderCreated>> {
    if (command.items.length === 0) {
      return Result.failure(
        UseCaseError.validation('NO_ITEMS', 'Order must contain at least one item'),
      );
    }

    const customer = await this.customerRepository.findById(command.customerId);
    if (!customer) {
      return Result.failure(
        UseCaseError.notFound('CUSTOMER_NOT_FOUND', `Customer ${command.customerId} not found`),
      );
    }

    const order = createOrder({ customerId: customer.id, items: command.items });
    const event = new OrderCreated(scope, { orderId: order.id, customerId: customer.id });

    return this.unitOfWork.commit(order, event, command);
  }
}
```

### Route handler (thin wrapper)

```typescript
server.post('/orders', async (req, reply) => {
  const scope = ScopeStore.require();
  const result = await createOrderUseCase.execute(req.body, scope);

  return Result.match(
    result,
    (event) => reply.status(201).send({ orderId: event.getData().orderId }),
    (error) => reply.status(UseCaseError.httpStatus(error)).send({
      error: error.code,
      message: error.message,
    }),
  );
});
```

---

## Jobs & scheduled tasks

### Scheduled tasks

Define tasks in `packages/server/src/scheduling/registry.ts`:

```typescript
import type { ScheduledTaskDefinition } from './types.js';
import { SystemIdentity } from './types.js';

export const scheduledTasks: ScheduledTaskDefinition[] = [
  {
    name: 'cleanup-expired-holds',
    schedule: '0 */6 * * *',
    identity: SystemIdentity.SCHEDULER,
    handler: async (scope) => {
      // scope is available here and in all called functions via ScopeStore
      await cleanupExpiredHolds();
    },
  },
];
```

### One-off jobs (queue workers, event handlers)

```typescript
import { runJob } from '@fulfil/framework';

// In a queue worker handler:
async function handlePaymentReceived(message: PaymentMessage): Promise<void> {
  await runJob(
    {
      name: 'handle-payment-received',
      identity: { principalId: 'system:payment-worker' },
      correlationId: message.correlationId,
      causationId: message.eventId,
    },
    async (scope) => {
      await recordPaymentUseCase.execute(
        { paymentId: message.paymentId, amount: message.amount },
        scope,
      );
    },
  );
}
```

Enable SQL sampling for a specific job (useful for debugging):

```typescript
await runJob(
  { name: 'slow-batch', identity: workerIdentity, sqlSampling: true },
  async (scope) => { /* ... */ },
);
```

---

## Cache

### Setup

```typescript
import { createCacheManager, createArrayStore, createRedisStore } from '@fulfil/framework';
import Redis from 'ioredis';

const cache = createCacheManager(
  {
    memory: createArrayStore(),
    redis: createRedisStore({ client: new Redis(process.env.REDIS_URL) }),
  },
  'memory', // default store
);
```

### Basic operations

```typescript
const store = cache.store();          // default store
const redisStore = cache.store('redis');

// Get / set
const value = await store.get<User>('user:123');
await store.set('user:123', user, 300); // TTL 300s

// Delete
await store.forget('user:123');

// Cache-aside (fetch if missing)
const user = await store.remember('user:123', 300, () => userRepository.findById('123'));
```

### Tagged cache (for invalidation)

```typescript
// Store with tags
await store.tags(['user:123', 'users']).set('user:123:profile', profile, 600);
await store.tags(['tenant:abc', 'orders']).set('tenant:abc:orders', orders, 120);

// Invalidate all entries tagged 'user:123'
await store.tags(['user:123']).flush();
```

---

## SLA tracking & SQL sampling

The SLA tracker monitors route response times with a sliding window. When a route's breach rate exceeds 5%, it enters **collecting mode**: SQL queries are captured for subsequent slow requests, and a `SlaSample` (including the query list) is persisted for analysis.

### Configuring routes

Pass `RouteSlaDef` entries when creating the tracker in `server.ts`:

```typescript
import { createSlaTracker } from '@fulfil/framework';

const slaTracker = createSlaTracker([
  { route: '/orders',           thresholdMs: 200 },
  { route: '/orders/:id',       thresholdMs: 150 },
  { route: '/drivers/:id/location', thresholdMs: 100, windowSize: 100, samplesToCollect: 5 },
]);
```

The `route` must match the Fastify route pattern exactly (e.g. `/orders/:id`, not `/orders/123`).

### Per-route SLA in route options

Declare an SLA threshold directly on a route. The plugin reads it in the `onSend` hook:

```typescript
server.get(
  '/orders',
  { config: { sla: { thresholdMs: 200 } } },
  handler,
);
```

> Note: the route must also be registered in `createSlaTracker()` for SQL sampling to work. The `config.sla` option alone only enables per-request SLA recording.

### Manual SQL tracing

Force SQL capture on any request by sending the header:

```
X-SQL-Trace: true
```

The captured queries are available via `scope.sqlAudit.flush()` after the request completes.

### Drizzle integration

Set `ScopeAwareDrizzleLogger` when initialising Drizzle (already done in `infrastructure/db.ts`):

```typescript
import { ScopeAwareDrizzleLogger } from '@fulfil/framework';

export const db = drizzle(sql, { logger: new ScopeAwareDrizzleLogger() });
```

When `scope.sqlAudit.isCapturing` is `true`, every query is recorded into the scope's SQL audit buffer automatically.

---

## Prometheus metrics

Pre-defined metrics are exported from the framework. All are recorded automatically by the Fastify plugin. Access them for custom recording:

```typescript
import { metrics, getMetricsRegistry } from '@fulfil/framework';

// Record job duration manually
const end = metrics.jobDuration.startTimer({ job_name: 'my-job' });
await doWork();
end();

// Record cache operations
metrics.cacheOperation.inc({ store: 'redis', operation: 'hit' });
```

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_request_duration_ms` | Histogram | `method`, `route`, `status_code` | HTTP request duration |
| `sla_breach_total` | Counter | `route` | SLA breach count per route |
| `job_duration_ms` | Histogram | `job_name` | Job execution duration |
| `cache_operations_total` | Counter | `store`, `operation` | Cache operation counts |
| `notices_captured_total` | Counter | `level` | Notice captures by level |

The `/metrics` endpoint is registered automatically by the Fastify plugin.

---

## Notice service

Notices are structured log entries for observable business events, degraded states, or anomalies. They differ from domain events (no transactional guarantee) and from logs (typed, persisted, queryable).

### Creating the service

```typescript
import { createNoticeService } from '@fulfil/framework';
import { createDrizzleNoticeRepository } from './infrastructure/notice-repository.js';

const noticeService = createNoticeService({
  repository: createDrizzleNoticeRepository(db),
  // Optional: emit a FlowCatalyst event for notices with emitEvent: true
  onEmitEvent: async (notice) => {
    await outboxManager.createEvent(/* NoticeEvent.from(notice) */);
  },
});
```

### Capturing notices

`capture()` reads the current scope automatically — no need to pass it:

```typescript
await noticeService.capture({
  level: 'warn',
  code: 'DRIVER_LOCATION_STALE',
  message: 'Driver location has not been updated in over 10 minutes',
  aggregateType: 'Driver',
  aggregateId: driver.id,
  metadata: { lastUpdatedAt: driver.locationUpdatedAt.toISOString() },
});

await noticeService.capture({
  level: 'error',
  code: 'PAYMENT_GATEWAY_TIMEOUT',
  message: 'Payment gateway did not respond within 5 seconds',
  emitEvent: true, // triggers onEmitEvent hook
});
```

### Notice levels

| Level | Use |
|---|---|
| `info` | Business events worth recording but not actionable |
| `warn` | Degraded state — system functional but something needs attention |
| `error` | Operation failed in a non-fatal but significant way |

---

## Fastify plugin

The framework plugin handles scope lifecycle, SLA tracking, and metrics for every request.

### Registration

```typescript
import { frameworkFastifyPlugin, createSlaTracker } from '@fulfil/framework';
import { createDrizzleSlaSampleRepository } from './infrastructure/sla-sample-repository.js';

await server.register(frameworkFastifyPlugin, {
  slaTracker: createSlaTracker([
    { route: '/orders',     thresholdMs: 200 },
    { route: '/orders/:id', thresholdMs: 150 },
  ]),
  slaSampleRepository: createDrizzleSlaSampleRepository(db),
  extractRequestToken: (req) => {
    // Return RequestToken from validated OIDC token, or null for public routes
    const token = req.oidcToken; // your auth middleware sets this
    if (!token) return null;
    return {
      sub: token.sub,
      correlationId: req.headers['x-correlation-id'] as string | undefined,
    };
  },
});
```

### What the plugin does

**`onRequest` hook**
- Calls `extractRequestToken(req)`
- If a token is returned: creates a `Scope` and runs the rest of the request inside `ScopeStore.run()`
- If null: continues without a scope (public route)
- Checks `slaTracker.shouldCaptureSql(route)` and the `X-SQL-Trace` header to set SQL capture mode

**`onSend` hook**
- Finishes the `MeasurementContext` to get `durationMs`
- Records `http_request_duration_ms` Prometheus metric
- Calls `slaTracker.record()` for routes with `config.sla` set
- Persists `SlaSample` if the tracker returns one

**`GET /metrics`**
- Returns Prometheus text output

---

## Logging

Create a child logger with scope fields pre-attached:

```typescript
import { createContextLogger, ScopeStore } from '@fulfil/framework';

const scope = ScopeStore.require();
const log = createContextLogger(server.log, scope);

// Every call now includes executionId, correlationId, principalId
log.info({ orderId }, 'Order confirmed');
log.error({ err }, 'Failed to dispatch driver');
```

Fields added automatically: `executionId`, `correlationId`, `principalId`.
