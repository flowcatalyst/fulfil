# Fulfil — On-Demand Fulfilment Logistics Platform

## Project Overview

On-demand fulfilment logistics application built with TypeScript. Consists of a server (API), a management web app (Vue + PrimeVue), and an execution mobile app (Vue + Capacitor).

## Technology Stack

### Server
- **Runtime**: Node.js with TypeScript (strict mode)
- **HTTP Framework**: Fastify with `fastify-type-provider-typebox`
- **Logging**: Pino (structured logging, integrated via Fastify)
- **Validation & Schemas**: TypeBox for event type schemas and API endpoint schemas; Zod for other shared/domain validation
- **OpenAPI**: `@fastify/swagger` + `@fastify/swagger-ui` — generated from TypeBox schemas, never hand-written
- **ORM**: Drizzle ORM with PostgreSQL
- **Database**: PostgreSQL
- **Auth**: OIDC Connect
- **Scheduling**: croner (in-process scheduled tasks)
- **Events**: `@flowcatalyst/sdk` OutboxManager — transactional outbox pattern
- **Error Handling**: `Result<T>` from `@flowcatalyst/sdk`'s `usecase` namespace — restricted success factory (only UnitOfWork can create success), explicit typed error paths
- **Context Propagation**: `AsyncLocalStorage` via `ScopeStore` in `@fulfil/framework` — identity and tracing context available everywhere
- **ID Generation**: TSID (via `@flowcatalyst/sdk` `generateTsid`)
- **Use Case Primitives**: `@flowcatalyst/sdk` `usecase` namespace — `Result`, `UseCaseError`, `DomainEvent`, `BaseDomainEvent`, `ExecutionContext`, `UseCase`, `SecuredUseCase`, `UnitOfWork`, `Aggregate`, `OutboxUnitOfWork`. `@fulfil/framework` re-exports them for convenience; single source of truth is the SDK.

### Management App
- **Framework**: Vue 3 with TypeScript (strict mode)
- **UI Components**: PrimeVue 4
- **Build**: Vite
- **Testing**: Vitest

### Execution App
- **Framework**: Vue 3 with TypeScript (strict mode)
- **Native**: Capacitor.js
- **Build**: Vite
- **Testing**: Vitest

### Tooling
- **Runtime**: Node.js 24 LTS
- **Package Manager**: pnpm (strict, no npm or yarn)
- **Monorepo**: pnpm workspaces
- **Linting**: oxlint
- **Formatting**: oxfmt
- **Schemas**: TypeBox for event types and endpoint schemas; Zod for shared/domain validation
- **Testing**: Vitest across all packages

---

## Project Structure

```
fulfil/
├── CLAUDE.md
├── package.json                    # Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json              # Shared strict TS config
├── packages/
│   ├── shared/                     # Shared types, schemas, contracts
│   │   ├── src/
│   │   │   ├── schemas/            # Zod schemas (source of truth)
│   │   │   ├── types/              # TypeScript types derived from schemas
│   │   │   └── contracts/          # API request/response contracts
│   │   └── package.json
│   ├── framework/                  # @fulfil/framework — Scope/ScopeStore, runJob,
│   │   │                           # SlaTracker, NoticeService, CacheManager,
│   │   │                           # ScopeAwareDrizzleLogger, Fastify plugin.
│   │   │                           # Re-exports SDK usecase primitives for convenience.
│   │   └── package.json
│   ├── server/                     # Fastify backend
│   │   ├── src/
│   │   │   ├── domain/             # Domain models and aggregates
│   │   │   ├── infrastructure/     # Drizzle repos, outbox driver, UoW, external integrations
│   │   │   ├── operations/         # Use cases grouped by aggregate
│   │   │   ├── api/                # Fastify routes, middleware, plugins
│   │   │   ├── scheduling/         # Scheduled task definitions and registry
│   │   │   └── server.ts           # Fastify server bootstrap
│   │   ├── drizzle/                # Migrations
│   │   └── package.json
│   ├── management-app/             # Vue + PrimeVue management UI
│   │   ├── src/
│   │   └── package.json
│   └── execution-app/              # Vue + Capacitor mobile app
│       ├── src/
│       └── package.json
```

---

## Architecture Patterns

### Identity Is a First-Class Citizen

Every execution path has an identity. No code runs anonymously.

- **HTTP requests**: Identity extracted from OIDC token via middleware, set in `AsyncLocalStorage`
- **Scheduled tasks**: Identity declared in the task definition (system/service identity)
- **Async background work**: Identity propagated from the originating context

### Scope (extends SDK ExecutionContext)

The SDK defines `ExecutionContext` — the five tracing/principal fields. `@fulfil/framework` defines `Scope`, which is **structurally compatible** with `ExecutionContext` (has all five fields) plus Fulfil extras: `principalType`, `tenant`, `measurement`, `sqlAudit`. A `Scope` can be passed anywhere the SDK expects an `ExecutionContext` — including `BaseDomainEvent` constructors.

```typescript
interface Scope /* ⊃ ExecutionContext */ {
  readonly executionId: string;        // Unique per use case execution
  readonly correlationId: string;      // Distributed tracing — preserved across service boundaries
  readonly causationId: string | null; // Parent event ID for event-driven chains
  readonly principalId: string;        // Authenticated user or service account
  readonly initiatedAt: Date;
  readonly principalType: 'USER' | 'SERVICE';
  readonly tenant: TenantContext | null;
  readonly measurement: MeasurementContext;
  readonly sqlAudit: SqlAuditContext;
}
```

Factory methods for different entry points:
- `Scope.fromRequest(token, options?)` — HTTP request, extracts from OIDC token + tracing headers
- `Scope.forScheduledTask(identity)` — scheduled task with declared identity
- `Scope.fromParentEvent(parentEvent, identity)` — event-driven continuation

The scope is available via `ScopeStore` (AsyncLocalStorage). Any code that needs identity reads it via `ScopeStore.get()` — no parameter drilling. Fastify entry points populate it through `frameworkFastifyPlugin`; scheduled tasks populate it through `runJob(...)`.

### UnitOfWork Pattern

Guarantees that aggregate persistence, domain event creation, and audit logging are atomic. The interface and its primary implementation (`OutboxUnitOfWork`) come from `@flowcatalyst/sdk`'s `usecase` namespace; Fulfil's `createDrizzleUnitOfWork` wraps the SDK implementation in a Drizzle transaction.

**Core guarantee**: If an aggregate is persisted, the corresponding event WILL be emitted. There is no path to a successful result without going through UnitOfWork. `Result.success()` requires a `RESULT_SUCCESS_TOKEN` private to the SDK, so only `OutboxUnitOfWork` can construct success.

```typescript
// From @flowcatalyst/sdk (re-exported by @fulfil/framework)
interface UnitOfWork {
  commit<T extends DomainEvent>(event: T, command: unknown, persist?: () => Promise<void>): Promise<Result<T>>;
  commitAggregate<T extends DomainEvent>(aggregate: Aggregate, event: T, command: unknown, persist?: () => Promise<void>): Promise<Result<T>>;
  commitDelete<T extends DomainEvent>(aggregate: Aggregate, event: T, command: unknown, persist?: () => Promise<void>): Promise<Result<T>>;
  emitEvent<T extends DomainEvent>(event: T, command: unknown): Promise<Result<T>>;
}
```

Fulfil's `createDrizzleUnitOfWork` implements atomicity as follows:
1. Open a Drizzle transaction via `TransactionManager`
2. Construct a tx-bound `DrizzleOutboxDriver` → `OutboxManager` → `OutboxUnitOfWork.fromDriver(driver, clientId, { auditEnabled: true })`
3. Call `sdkUow.commit(event, command, persistFn)` where `persistFn`:
   - Runs `aggregateRegistry.persist(aggregate, tx)` or `delete` for the aggregate variants
   - Inserts a local `audit_logs` row in the same tx (hybrid audit — see below)
4. The SDK `OutboxUnitOfWork` writes the `CreateEventDto` (and with `auditEnabled: true`, also a `CreateAuditLogDto`) to `outbox_messages` via the tx-bound driver
5. Drizzle transaction commits — all writes atomic

The `fc-outbox-processor` reads from `outbox_messages` and dispatches to the FlowCatalyst platform — not Fulfil's concern.

**Supporting infrastructure**:
- **TransactionManager** — wraps Drizzle's `db.transaction()` with a `TransactionContext`
- **AggregateRegistry** — dispatches `persist`/`delete` to the correct repository based on aggregate type
- **DrizzleOutboxDriver** — tx-bound driver so outbox writes participate in the same transaction
- **createDrizzleUnitOfWork(config)** — factory for the concrete implementation
- **createNoOpUnitOfWork()** — in-memory no-op driver for testing; returns SDK success without persistence

### Use Case Pattern

Every write operation is a use case. Each use case lives in its own directory under `operations/`.

```
operations/
├── create-order/
│   ├── create-order.command.ts       # Immutable command DTO
│   └── create-order.use-case.ts      # Handler
├── assign-driver/
│   ├── assign-driver.command.ts
│   └── assign-driver.use-case.ts
```

Use cases implement the SDK's `UseCase<TCommand, TEvent>` interface (or extend `SecuredUseCase` for deny-by-default resource authorization):

**Use case structure**:
1. **Validation phase** — returns `Result.failure()` for invalid input
2. **Domain logic phase** — builds aggregates and events
3. **Atomic commit phase** — `unitOfWork.commitAggregate(...)` / `commit(...)` is the only path to success

```typescript
import type { UseCase, UnitOfWork, Result, Scope } from '@fulfil/framework';

class CreateOrderUseCase implements UseCase<CreateOrderCommand, OrderCreated> {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly orderRepository: OrderRepository,
  ) {}

  async execute(
    command: CreateOrderCommand,
    scope: Scope,  // Scope is structurally compatible with the SDK ExecutionContext
  ): Promise<Result<OrderCreated>> {
    // 1. Validate — return Result.failure(UseCaseError.validation(...))
    // 2. Build aggregate + domain event
    const order = buildOrder(command);
    const event = new OrderCreated(scope, { orderId: order.id, customerId: command.customerId });
    // 3. Commit atomically — aggregateRegistry.persist runs inside the tx
    return this.unitOfWork.commitAggregate(order, event, command);
  }
}
```

### Result Type

`Result<T>` comes from `@flowcatalyst/sdk`'s `usecase` namespace (re-exported by `@fulfil/framework`). No thrown exceptions for business logic.

```typescript
// Result is a discriminated union: Success<T> | Failure<T>
// Result.success() requires RESULT_SUCCESS_TOKEN — held only by the SDK's OutboxUnitOfWork
// Result.failure() is public — any code can create failures

// UseCaseError is a discriminated union (type field)
type UseCaseError =
  | ValidationError        // type: 'validation'     → 400
  | NotFoundError          // type: 'not_found'      → 404
  | BusinessRuleViolation  // type: 'business_rule'  → 409
  | ConcurrencyError       // type: 'concurrency'    → 409
  | AuthorizationError     // type: 'authorization'  → 403
  | InfrastructureError;   // type: 'infrastructure' → 500

// Factory namespace: UseCaseError.validation(), .notFound(), .businessRule(), .concurrency(), .authorization(), .infrastructure()
// HTTP mapping: UseCaseError.httpStatus(error)
```

API routes pattern-match on the result (`isSuccess`/`isFailure`) to map to HTTP status codes.

### Domain Events

Events are class instances extending `BaseDomainEvent<TData>` from the SDK (re-exported by `@fulfil/framework`). They implement the `DomainEvent` interface (CloudEvents structure with tracing fields). `OutboxUnitOfWork` converts them to `CreateEventDto` → `outbox_messages` automatically.

```typescript
import { BaseDomainEvent, DomainEvent, type Scope } from '@fulfil/framework';

interface OrderCreatedData {
  orderId: string;
  customerId: string;
}

class OrderCreated extends BaseDomainEvent<OrderCreatedData> {
  constructor(scope: Scope, data: OrderCreatedData) {
    super({
      eventType: DomainEvent.eventType('fulfil', 'logistics', 'order', 'created'),
      specVersion: '1.0',
      source: 'fulfil:logistics',
      subject: DomainEvent.subject('logistics', 'order', data.orderId),
      messageGroup: DomainEvent.messageGroup('logistics', 'order', data.orderId),
    }, scope, data);
  }
}
```

The `DomainEvent` namespace provides helpers: `subject(domain, aggregate, id)`, `messageGroup(domain, aggregate, id)`, `eventType(app, domain, aggregate, action)`, `extractAggregateType(subject)`, `extractEntityId(subject)`, `generateId()`.

### Audit Logging

Hybrid audit: every successful UnitOfWork commit writes **two** audit records in the same Drizzle transaction:

1. **Local `audit_logs` row** — strong integrity, queryable locally without a platform round-trip. Source of truth for compliance/forensics.
2. **SDK `CreateAuditLogDto`** via `OutboxManager` (`auditEnabled: true`) — emitted to `outbox_messages` for `fc-outbox-processor` to forward to the FlowCatalyst platform, giving a cross-system audit view.

Both writes happen inside the tx-bound outbox driver, so if the business write commits, both audit records commit. If either audit write fails, the entire transaction rolls back.

- **Transactional fulfilment operations**: audit entries created by UnitOfWork automatically
- **Management operations** (CRUD config, admin actions): NO audit logs required

### Scheduled Tasks

Simple typed registry pattern using croner. No decorators/annotations.

```typescript
import type { Scope } from '@fulfil/framework';

const scheduledTasks: ScheduledTaskDefinition[] = [
  {
    name: 'cleanup-expired-holds',
    schedule: '0 */6 * * *',
    identity: SystemIdentity.SCHEDULER,
    handler: (scope: Scope) => cleanupExpiredHolds(scope),
  },
];
```

The scheduler iterates definitions at startup and registers each with croner. Each firing goes through `runJob(...)` from `@fulfil/framework`, which constructs a `Scope` with the declared identity and puts it in `ScopeStore` (AsyncLocalStorage) for the handler's duration.

---

## Coding Rules

### TypeScript

- **Strict mode everywhere**: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- **No `any`**: Use `unknown` and narrow. If you need a generic, type it properly.
- **No magic strings**: Use const objects, enums, or branded types. Arrays of magic strings are forbidden.
- **Prefer discriminated unions** over optional fields or boolean flags
- **Immutable by default**: Use `readonly` on properties. Commands and DTOs are immutable.
- **No classes for data**: Use plain objects with type annotations. Classes are for behaviour (use cases, services, managers).
- **Explicit return types** on all public functions and methods

### TypeBox Schemas (Event Types & Endpoints)

- **Event type schemas** and **API endpoint request/response schemas** use TypeBox
- TypeScript types derived from TypeBox schemas via `Static<typeof schema>`
- OpenAPI spec is generated from TypeBox schemas — never hand-written
- Fastify routes use `fastify-type-provider-typebox` for compile-time type safety

### Zod Schemas (Shared & Domain)

- Zod used for shared domain validation and cross-package schemas
- TypeScript types derived via `z.infer<typeof schema>`
- Schemas live in `packages/shared/src/schemas/` and are imported by server and clients
- Database column types should align with schemas

### API Design

- All routes use `fastify-type-provider-typebox` for compile-time type safety
- Request/response schemas defined with TypeBox, OpenAPI generated automatically
- Route handlers are thin — extract command from request, call use case, map result to response
- Consistent error response shape across all endpoints
- Use proper HTTP status codes mapped from `UseCaseError.type` via `UseCaseError.httpStatus()`:
  - `validation` → 400
  - `not_found` → 404
  - `business_rule` / `concurrency` → 409
  - `authorization` → 403

### Repository Pattern

- Repository interfaces defined in `domain/` — pure TypeScript interfaces
- Implementations in `infrastructure/` using Drizzle
- Repositories return domain types, not Drizzle row types
- Read operations: queries (no Scope needed)
- Write operations: go through UnitOfWork, never called directly from routes

### Error Handling

- Business logic errors: `Result.failure()` with typed `UseCaseError` — never throw
- Infrastructure errors (DB down, network): let them throw, caught by Fastify error handler
- No `try/catch` in use cases for business logic flow

### Logging

- Use Pino structured logging (comes with Fastify)
- Log with context: always include `correlationId`, `executionId`, `principalId` from the `Scope` in `ScopeStore`
- Log levels: `error` for failures, `warn` for degraded state, `info` for business events, `debug` for development
- No `console.log` — always use the logger

### Testing

- Vitest for all packages
- Use cases tested with `createNoOpUnitOfWork()` or real implementations (repository fakes, not mocks)
- Schemas tested for validation edge cases
- API routes tested via Fastify's `inject()` method

### Dependencies & Imports

- **`@flowcatalyst/sdk` is the source of truth** for use-case primitives via its `usecase` namespace:
  - `Result`, `UseCaseError`, `DomainEvent`, `BaseDomainEvent`, `ExecutionContext`, `UseCase`, `SecuredUseCase`, `UnitOfWork`, `Aggregate`, `OutboxUnitOfWork`
  - Also: `OutboxManager`, `OutboxDriver`, `OutboxMessage`, `CreateEventDto`, `CreateAuditLogDto`, `CreateDispatchJobDto`, `generateTsid`, `isValidTsid`, `FlowCatalystClient`
- **`@fulfil/framework` re-exports** the SDK `usecase` primitives and adds Fulfil-specific infrastructure: `Scope`, `ScopeStore`, `runJob`, `SlaTracker`, `NoticeService`, `CacheManager`, `ScopeAwareDrizzleLogger`, `frameworkFastifyPlugin`, `metrics`. Server code imports from `@fulfil/framework` for both.
- Where there's a choice between framework and SDK, prefer SDK unless framework adds something Fulfil-specific.
- Shared package (`@fulfil/shared`) for cross-package schemas and types
- No circular dependencies between packages

### Contracts & Type Safety

- **Well-typed APIs**: Every route has typed request params, query, body, and response
- **No arrays with magic strings**: Use typed enums, const objects, or branded types for any set of known values
- **Discriminated unions** for polymorphic data (order types, status transitions, etc.)
- **Branded types** for IDs (`OrderId`, `DriverId`) to prevent accidental mixing
- **Const assertions** (`as const`) for literal union derivation

### File Naming

- `kebab-case` for all files: `create-order.use-case.ts`, `order.repository.ts`
- Suffix conventions:
  - `.command.ts` — command DTOs
  - `.use-case.ts` — use case handlers
  - `.repository.ts` — repository interfaces
  - `.schema.ts` — Zod schemas
  - `.routes.ts` — Fastify route definitions
  - `.plugin.ts` — Fastify plugins
  - `.test.ts` — test files

### What NOT to Do

- Never bypass UnitOfWork for write operations — no direct repository writes from routes
- Never create events outside of UnitOfWork — the outbox insert must be in the same transaction
- Never run code without identity — every path sets a `Scope` in `ScopeStore` (AsyncLocalStorage)
- Never duplicate the SDK's use-case primitives in `@fulfil/framework` — re-export them instead
- Never hand-write OpenAPI — it comes from TypeBox schemas
- Never use `any` — use `unknown` and type guards
- Never use thrown exceptions for business logic flow — use Result types
- Never use `console.log` — use Pino logger
- Never put business logic in route handlers — they are thin wrappers around use cases
