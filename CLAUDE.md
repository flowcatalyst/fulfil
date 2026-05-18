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
- **Effect System**: `effect` (v4 beta, pinned) — write-path use cases return `Effect<Sealed<E>, UseCaseError, R>`. Errors are `Data.TaggedError` classes; the success seal can only be produced by the SDK's `OutboxUnitOfWork.layer`, so a use case that bypasses `UnitOfWork.commit` doesn't compile.
- **Context Propagation**: `AsyncLocalStorage` via `ScopeStore` in `@fulfil/framework` — identity and tracing context available everywhere. Drizzle tx is bound on a second ALS (`TransactionStore`) by `AppContext.runWrite` so the outbox driver and persist callbacks share the same tx.
- **ID Generation**: TSID (via `@flowcatalyst/sdk` `generateTsid`)
- **Use Case Primitives**: `@flowcatalyst/sdk/effect/usecase` — `UnitOfWork` / `ExecutionContext` Tags, `Sealed<E>`, tagged errors (`ValidationError`, `NotFoundError`, `BusinessRuleViolation`, `ConcurrencyError`, `AuthorizationError`, `InfrastructureError`), `httpStatus`, `DomainEvent` / `BaseDomainEvent`, `OutboxUnitOfWork.layer`, `TestUnitOfWork.layer`. `@fulfil/framework` re-exports them; single source of truth is the SDK.

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

Guarantees that aggregate persistence, domain event creation, and audit logging are atomic. The `UnitOfWork` Tag and `OutboxUnitOfWork.layer` come from `@flowcatalyst/sdk/effect/usecase`. Fulfil composes the SDK layer with a Drizzle transaction via two AsyncLocalStorage stores.

**Core guarantee**: If an aggregate is persisted, the corresponding event WILL be emitted. There is no path to a successful result without going through `UnitOfWork.commit`. `Sealed<E>` carries a module-private brand that only the SDK's UoW layer can construct — bypassing the UoW is a **compile error**, not just a runtime check.

```typescript
// From @flowcatalyst/sdk/effect/usecase (re-exported by @fulfil/framework)
class UnitOfWork extends Context.Service<UnitOfWork, {
  commit:       <E extends DomainEvent>(event: E, command: unknown, persist?: () => Promise<void>) => Effect.Effect<Sealed<E>, ConcurrencyError | InfrastructureError>;
  commitDelete: <E extends DomainEvent>(agg: Aggregate, event: E, command: unknown, persist?: () => Promise<void>) => Effect.Effect<Sealed<E>, ConcurrencyError | InfrastructureError>;
  emitEvent:    <E extends DomainEvent>(event: E, command: unknown) => Effect.Effect<Sealed<E>, InfrastructureError>;
}>()("@flowcatalyst/UnitOfWork") {}
```

Atomicity is layered on Fulfil-side with two ALS stores:

1. **`TransactionStore` (AsyncLocalStorage<TransactionContext>)** — set by `AppContext.runWrite` for the duration of one request. Holds the active Drizzle tx.
2. **ALS-aware `DrizzleOutboxDriver`** — stateless instance constructed once at composition root. On every `insert` it reads the tx from `TransactionStore.require()`.
3. **One `OutboxManager`** built once over that driver, passed to `OutboxUnitOfWork.layer(manager, { auditEnabled: true })` to produce `UoWLive`.
4. **`commitAggregate(aggregate, event, command)`** — Fulfil helper that calls `uow.commit(event, command, persist)` where `persist` runs `aggregateRegistry.persist(agg, tx)` and inserts a local `audit_logs` row, both reading the tx from `TransactionStore`.
5. **`AggregateRegistry`** is exposed as an Effect Tag, so `commitAggregate` declares `R = UnitOfWork | AggregateRegistry`. App-context provides both as Layers via `ManagedRuntime`.

The full per-request flow:
1. Route handler reads `Scope` from `ScopeStore`, builds the command, calls `appContext.runWrite(useCase.execute(command), scope)`.
2. `runWrite` opens a Drizzle tx through `TransactionManager`, binds it on `TransactionStore`, runs the Effect with `UoWLive` + `AggregateRegistry` layers provided, collapses errors via `Effect.result`.
3. Use case yields validations as `Effect.fail(new ValidationError({...}))`, builds the aggregate + event, then `yield* commitAggregate(...)`.
4. `commitAggregate` → `sdkUow.commit(event, command, persist)` → persist callback writes aggregate + local audit row in tx → SDK layer writes outbox event + outbox audit log via tx-bound driver → tx commits.
5. Result surfaces as `Result.Result<Sealed<E>, UseCaseError>`. Route handler maps `Result.failure` → HTTP error via `sendUseCaseError`, `Result.success` → 201.

The `fc-outbox-processor` reads from `outbox_messages` and dispatches to the FlowCatalyst platform — not Fulfil's concern.

**Supporting infrastructure** (all in `packages/server/src/infrastructure/`):
- **`TransactionManager`** — wraps Drizzle's `db.transaction()`
- **`TransactionStore`** — ALS holding the active Drizzle tx; bound by `runWrite`
- **`AggregateRegistry`** (impl) — dispatches `persist`/`delete` to the correct repository
- **`AggregateRegistry`** (Effect Tag, in `unit-of-work.ts`) — `Context.Service<AggregateRegistry, AggregateRegistryImpl>`
- **`DrizzleOutboxDriver`** — ALS-aware, stateless, shared across requests
- **`buildOutboxManager({ clientId })`** — builds the single `OutboxManager` that backs both UoW and the DispatchJobBroker
- **`unitOfWorkLayer(manager)`** — `Layer<UnitOfWork>` from the shared OutboxManager via SDK's `OutboxUnitOfWork.layer`
- **`dispatchJobBrokerLayer(manager)`** — `Layer<DispatchJobBroker>` from the same OutboxManager
- **`commitAggregate` / `commitDelete`** — Fulfil helpers that wrap `uow.commit*` with the registry + local-audit persist callback
- **`TestUnitOfWork.layer(buffer)`** (from SDK) — record-only UoW for tests; never opens a tx

### DispatchJobBroker

`DispatchJobBroker` is a Fulfil-defined Effect Tag (in `infrastructure/unit-of-work.ts`) that wraps `OutboxManager.createDispatchJob(dto)` / `createDispatchJobs(dtos)`. It exists because the SDK's Effect `UnitOfWork` Tag covers events + audit logs but not dispatch jobs. Both Layers ride the same `OutboxManager` → same `DrizzleOutboxDriver` → same `TransactionStore`-bound Drizzle tx, so emitting a dispatch job is atomic with the aggregate commit that spawned it.

```typescript
// Inside a use case's Effect.gen:
const broker = yield* DispatchJobBroker;
const jobId = yield* broker.emit(
  CreateDispatchJobDto.create(
    'fulfil:lastmile',                          // source
    'fulfil:lastmile:shipment:create',          // code (the operation)
    `${publicBaseUrl}/shipments`,               // targetUrl
    JSON.stringify(shipmentCommand),            // payload
    'fulfil-default',                           // dispatchPoolCode
  )
    .withCorrelationId(scope.correlationId)
    .withSubject(`platform.fulfilment.${id}`)
    .withMessageGroup(`platform.fulfilment.${id}`)
    .withDataOnly(true),
);
```

Use case R becomes `UnitOfWork | DispatchJobBroker | AggregateRegistry` (or any subset you actually yield). `AppContext.runWrite` provides all three Layers.

### Use Case Pattern

Every write operation is a use case. Each use case lives in its own directory under `operations/`. Use cases are Effect-typed; the seal (`Sealed<E>`) makes UoW-bypass a compile error. The reference implementation is `packages/server/src/operations/create-last-mile-fulfilment/` — copy its shape.

#### File layout

```
operations/
└── create-order/
    ├── create-order.command.ts       # Re-export from @fulfil/shared (Zod type)
    └── create-order.use-case.ts      # The Effect handler

domain/orders/
├── ids.ts                            # Branded ID types + prefixes + as-casters
├── orders.ts                         # Aggregate interface + namespace (create, transitions)
├── order.repository.ts               # Repository interface (domain owns it)
├── state.ts                          # Discriminated state-machine payload (if stateful)
└── events/
    └── order-created.event.ts        # extends BaseDomainEvent<TData>, ctx: Scope
```

Commands are Zod-validated objects defined in `@fulfil/shared`. The operations folder re-exports the type so the use case imports it locally.

#### Use case shape

```typescript
import { Effect } from 'effect';
import { generateTsid } from '@flowcatalyst/sdk';
import {
  AuthorizationError,
  BusinessRuleViolation,
  ScopeStore,
  ValidationError,
  type Sealed,
  type UnitOfWork,
  type UseCaseError,
} from '@fulfil/framework';
import {
  AggregateRegistry,
  commitAggregate,
} from '../../infrastructure/unit-of-work.js';
import { Order } from '../../domain/orders/order.js';
import type { OrderRepository } from '../../domain/orders/order.repository.js';
import { OrderCreated } from '../../domain/orders/events/order-created.event.js';
import type { CreateOrderCommand } from './create-order.command.js';

export class CreateOrderUseCase {
  // Permission constant — referenced by the use case's authorize check and
  // surfaced for documentation / role wiring.
  static readonly requiredPermission = OrderPermission.CreateOrder;

  // Inject read-side deps (repositories) only. UnitOfWork and AggregateRegistry
  // come from Effect Tags provided by AppContext.runWrite per request.
  constructor(private readonly orders: OrderRepository) {}

  execute = (
    command: CreateOrderCommand,
  ): Effect.Effect<
    Sealed<OrderCreated>,
    UseCaseError,
    UnitOfWork | AggregateRegistry
  > => {
    // ⚠️ FOOTGUN: `function*` body has its own `this`. Capture deps here.
    const orders = this.orders;
    const authorize = (): boolean => this.authorize();

    return Effect.gen(function* () {
      // 1. Identity (from ScopeStore ALS — NOT yield* ExecutionContext)
      const scope = ScopeStore.require();

      // 2. Authorization
      if (!authorize()) {
        return yield* Effect.fail(new AuthorizationError({
          code: 'PERMISSION_DENIED',
          message: `Missing permission ${OrderPermission.CreateOrder}.`,
        }));
      }

      // 3. Tenant precondition
      if (!scope.tenant) {
        return yield* Effect.fail(new ValidationError({
          code: 'TENANT_REQUIRED',
          message: 'Orders must be created within a tenant context.',
        }));
      }

      // 4. Cross-field validation (rules JSON Schema can't express)
      if (command.requestedDelivery < new Date()) {
        return yield* Effect.fail(new ValidationError({
          code: 'DELIVERY_IN_PAST',
          message: 'requestedDelivery is in the past.',
        }));
      }

      // 5. Repository reads — wrap raw Promises with Effect.tryPromise.
      //    The catch arm maps thrown errors into a tagged error.
      const existing = yield* Effect.tryPromise({
        try: () => orders.findByExternalRef(scope.tenant!.tenantId, command.externalRef),
        catch: (cause) => new BusinessRuleViolation({
          code: 'REPO_READ_FAILED',
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      });
      if (existing) {
        return yield* Effect.fail(new BusinessRuleViolation({
          code: 'ORDER_EXISTS',
          message: `Order already exists for externalRef ${command.externalRef}.`,
          details: { existingOrderId: existing.id },
        }));
      }

      // 6. Build aggregate + event from the fully-hydrated command.
      const order = Order.create({ id: newOrderId(), tenantId, ...command, now: new Date() });
      const event = new OrderCreated(scope, { orderId: order.id, /* … */ });

      // 7. Atomic commit — the ONLY path that produces Sealed<OrderCreated>.
      return yield* commitAggregate(order, event, command);
    });
  };

  private authorize(): boolean {
    // TODO(auth): real permission check
    return true;
  }
}
```

#### Recipe — adding a new operation end-to-end

For an operation called `assign-shipment`:

1. **Command** — define the Zod schema + type in `packages/shared/src/contracts/<subdomain>/assign-shipment.contract.ts`, re-export from `@fulfil/shared`. Then `packages/server/src/operations/assign-shipment/assign-shipment.command.ts` re-exports the type.
2. **Event** — `packages/server/src/domain/<subdomain>/events/shipment-assigned.event.ts`, extends `BaseDomainEvent<ShipmentAssignedData>`, constructor takes `scope: Scope` and calls `super({...}, scope as never, data)`.
3. **TypeBox event schema** (for OpenAPI) — `packages/server/src/api/schemas/<subdomain>/events/shipment-assigned.schema.ts`. Register it via `server.addSchema(...)` in `server.ts`.
4. **Use case** — `packages/server/src/operations/assign-shipment/assign-shipment.use-case.ts`. Constructor injects only the repository. Implement `execute` as shown above.
5. **Route** — `packages/server/src/api/routes/<subdomain>/assign-shipment.route.ts`. Accept `appContext: AppContext`. Build the command from the body, call `appContext.runWrite(useCase.execute(command), scope)`, pattern-match `Result.isFailure / isSuccess`, map success to a response DTO.
6. **Wire it** — in `packages/server/src/app-context.ts`:
   - Add the repository: `const shipmentRepo = createDrizzleShipmentRepository(db); registerShipment(aggregateRegistry, shipmentRepo);`
   - Add the prefix to `createAggregateRegistry({...})`
   - Construct the use case: `assignShipment: new AssignShipmentUseCase(shipmentRepo)`
7. **Plugin** — in `packages/server/src/api/routes/<subdomain>/index.ts`, register the route inside the plugin.

#### Conventions every use case follows

- **Class with arrow-bound `execute`** — never a method. Arrow form captures `this` for the field initializer; the `function*` generator body has its own `this`, so capture deps as `const x = this.x` outside `Effect.gen`.
- **Read-side deps in the constructor; write-side via Effect Tags.** UoW + AggregateRegistry come from `runWrite`, never from `new UseCase(...)`.
- **Identity from `ScopeStore.require()`**, NOT `yield* ExecutionContext`. Effect's `ExecutionContext` Tag is exported but unused — `ScopeStore` is the single identity source. This means use cases do NOT implement the SDK's `UseCase<TCmd, TEvent>` interface (which would force `R = UnitOfWork | ExecutionContext`).
- **All failures via `Effect.fail(new TaggedError({code, message, details?}))`.** Never `throw` for business-logic flow. Use the right tag — `ValidationError` (input wrong), `AuthorizationError` (principal lacks permission), `NotFoundError` (target missing), `BusinessRuleViolation` (invariant broken), `ConcurrencyError` (version conflict), `InfrastructureError` (DB/network).
- **DB reads inside the generator → `Effect.tryPromise({ try, catch })`.** Map the thrown error into a tagged `UseCaseError`. Don't `await` raw Promises inside `Effect.gen`.
- **`commitAggregate` for state changes; `commitDelete` for removals; `uow.emitEvent` for events without aggregate writes.** All three return `Sealed<E>` and are the only paths to success.
- **Events take `scope: Scope`** and `super(..., scope as never, data)` — Scope is structurally a superset of the SDK's neverthrow `ExecutionContext` interface; the cast satisfies the effect-side branded type.
- **`generateTsid()`** for new IDs (from `@flowcatalyst/sdk`). Prefix the result with the subdomain's prefix from `ids.ts`.

#### Effect 4 beta quick reference (renames from 3.x)

If you recall an Effect 3.x API that doesn't exist, check these renames first — Fulfil is on `effect@4.0.0-beta.66`:

| 3.x                          | 4.x (this codebase)                |
| ---------------------------- | ---------------------------------- |
| `Either`                     | `Result` (the namespace)           |
| `Effect.either(eff)`         | `Effect.result(eff)`               |
| `either.left` / `.right`     | `result.failure` / `.success`      |
| `Either.isLeft` / `isRight`  | `Result.isFailure` / `isSuccess`   |
| `Context.Tag(...)<Tag>()`    | `class T extends Context.Service<T, Shape>()("id") {}` |
| `Effect.gen(this, function*)`| `Effect.gen({ self: this }, function* (this: Self) {...})` — but prefer capturing deps in a `const` outside |

The SDK does **not** export `seal()` or `unseal()` — `Sealed<E>` brands are constructible only inside the SDK's UoW layers. Don't try to write a custom UoW layer that produces `Sealed<E>`; compose with `OutboxUnitOfWork.layer` (already done by `unitOfWorkLayer({ clientId })`).

#### Testing a use case

```typescript
import { Effect, Layer } from 'effect';
import { TestUnitOfWork, type DomainEvent } from '@fulfil/framework';
import { Layer as L } from 'effect';
import { AggregateRegistry } from '../../infrastructure/unit-of-work.js';

test('CreateOrder emits OrderCreated', async () => {
  const recorded: DomainEvent[] = [];
  const fakeRegistry: AggregateRegistryImpl = { /* persist/delete no-ops */ };

  const useCase = new CreateOrderUseCase(fakeOrderRepo);

  await ScopeStore.run(testScope, async () => {
    await Effect.runPromise(
      useCase.execute(testCommand).pipe(
        Effect.provide(TestUnitOfWork.layer(recorded)),
        Effect.provide(Layer.succeed(AggregateRegistry, fakeRegistry)),
      ),
    );
  });

  expect(recorded.map((e) => e.eventType)).toEqual([
    'fulfil:orders:order:created',
  ]);
});
```

`TestUnitOfWork.layer(buffer)` records emitted events without persisting or opening a tx. The aggregate registry is replaced with a fake (or a real one over an in-memory repository) and provided via `Layer.succeed`. `ScopeStore.run` provides identity, exactly as production does.

#### Route handler shape

Routes are thin: build the command, call `runWrite`, branch on the `Result`. The handler does NOT call `Effect.runPromise`, provide layers, or open transactions — `runWrite` does all of that.

```typescript
import type { FastifyInstance } from 'fastify';
import { Result } from 'effect';
import { ScopeStore } from '@fulfil/framework';
import type { AppContext } from '../../../app-context.js';
import { sendUseCaseError } from '../../plugins/error-mapper.js';

export function registerCreateOrderRoute(
  fastify: FastifyInstance,
  appContext: AppContext,
): void {
  fastify.post<{ Body: CreateOrderBody }>(
    '/orders',
    { schema: CreateOrderRouteSchema },
    async (request, reply) => {
      const command = bodyToCommand(request.body);
      const scope = ScopeStore.require();

      const result = await appContext.runWrite(
        appContext.useCases.createOrder.execute(command),
        scope,
      );

      if (Result.isFailure(result)) {
        return sendUseCaseError(reply, result.failure);
      }

      const event = result.success.event;            // unwrap the seal
      const data = event.getData();                  // typed event data
      return reply.code(201).send({ orderId: data.orderId, createdAt: event.time.toISOString() });
    },
  );
}
```

The `bodyToCommand` adapter converts the wire body (TypeBox-validated) into the use case's command shape — ISO strings → `Date`, missing optional fields → defaults. Cross-field rules (`end > start`) stay in the use case, not the adapter.

`sendUseCaseError(reply, error)` reads `error._tag` and maps to the HTTP status via `httpStatus(error)`.

#### Patterns beyond happy path

**Progressive error recovery.** Use cases usually fail terminally and the route boundary maps the error to HTTP. When a use case needs internal recovery — e.g. allocation failed, fall back to manual queue — use `Effect.catchTag`:

```typescript
const allocate = tryAutoAllocate(command).pipe(
  Effect.catchTag('BusinessRuleViolation', () => fallbackToManualQueue(command)),
);
```

The residual `E` no longer contains `BusinessRuleViolation` after `catchTag` — handled tags are subtracted from the union at compile time.

**Multiple aggregate writes in one tx.** Yield `commitAggregate` for the primary aggregate, then `commitAggregate` again for a secondary — both reads/writes are inside the same `runWrite` Drizzle tx because `TransactionStore` is ALS-scoped to it.

**Pure event emission (no aggregate change).** Yield `UnitOfWork` and call `uow.emitEvent(event, command)`:
```typescript
const uow = yield* UnitOfWork;
return yield* uow.emitEvent(new HeartbeatRecorded(scope, data), command);
```

**Reading from another aggregate inside a use case.** Inject the other repository in the constructor. Use `Effect.tryPromise` to call it. Cross-aggregate invariants stay in the calling use case — repositories don't enforce them.

### Processes (inbound webhook → decider → dispatch jobs)

Cross-aggregate workflows in Fulfil are modelled as **processes**: one webhook per business process, subscribed to *all* the event types that drive it. The process webhook is a **decider** — it inspects each inbound event, decides what work to do, and emits one dispatch job per action. Each action runs in its own transaction at a separate route, retried independently.

This is the inverse of the old "one webhook per event" reactor pattern. It matches FlowCatalyst's first-class `Processes` resource (Mermaid documentation of how events / dispatch jobs / aggregates compose).

**The rule** — when to dispatch vs inline:
- **Dispatch a job** when the action writes a *different* aggregate than the one whose event triggered it, or when the action is operationally independent (notifications, integrations, fan-out).
- **Stay inline** when the action is a single write to the *same* aggregate whose event you're processing — e.g. `FulfilmentCreated` event → set `fulfilment.reaction.awaitingEventType` is one aggregate, one tx. Inline preserves the invariant that the emitted event truthfully reflects committed aggregate state.

**Anatomy of a process** (LastMile fulfilment as the running example):

```
domain/<subdomain>/events/                         # all events the process handles + emits
operations/handle-<event-name>/                    # per-event handler use cases (the deciders)
operations/<action-name>/                          # per-action use cases (the dispatch targets)
api/routes/processes/<process-name>.route.ts       # the consolidated process webhook
api/routes/<aggregate>/                            # the action / dispatch-target routes
flowcatalyst/<subdomain>/subscriptions.ts          # ONE subscription per process, multiple eventTypes[]
```

**The process webhook** (routes by `x-fc-event-type` header):

```typescript
// /processes/last-mile-fulfilment.route.ts
fastify.post('/processes/last-mile-fulfilment', { schema }, async (request, reply) => {
  const eventType = readHeader(request.headers['x-fc-event-type']);
  const scope = resolveScope(request, { fallbackPrincipalId, bodyTenantId });

  return ScopeStore.run(scope, async () => {
    switch (eventType) {
      case 'fulfil:lastmile:fulfilment:created':
        return runFulfilmentCreated(appContext, request.body, scope, reply);
      case 'fulfil:lastmile:shipment:created':
        return runShipmentCreated(appContext, request.body, scope, reply);
      default:
        return reply.code(400).send({ /* unsupported eventType */ });
    }
  });
});
```

Each branch calls a per-event handler use case (`HandleLastMileFulfilmentCreated` / `HandleLastMileShipmentCreated`) via `appContext.runWrite(...)`. The handler decides what to do; cross-aggregate work goes out as dispatch jobs via `DispatchJobBroker.emit(...)`.

**Subscriptions are bundled per process** — one `SubscriptionDefinition` with multiple `eventTypes`:

```typescript
{
  code: 'last-mile-fulfilment-process',
  target: `${publicBaseUrl}/processes/last-mile-fulfilment`,
  eventTypes: [
    { eventTypeCode: 'fulfil:lastmile:fulfilment:created' },
    { eventTypeCode: 'fulfil:lastmile:shipment:created' },
  ],
  dispatchPoolCode, mode: 'BLOCK_ON_ERROR', dataOnly: true,
}
```

**Webhook scope**: framework Fastify plugin only sets a `Scope` when `extractRequestToken` returns one. Webhooks have no OIDC token, so the process route uses `resolveScope(request, ...)` which constructs `Scope.fromParentEvent` from `x-fc-correlation-id` + `x-fc-event-id` headers (with a service-principal identity like `'fulfil:process:last-mile-fulfilment'`). Subscription's `dataOnly: true` means the body is the event's `data` payload only.

**Multi-branch handlers.** A handler may return a *union* of sealed events — e.g. `HandleLastMileFulfilmentCreated` returns `Sealed<ShipmentRequested> | Sealed<AwaitingGeocoding>` depending on geo readiness. The webhook response is a TypeBox discriminated union (`status: 'shipment-requested' | 'awaiting-geocoding' | …`); the route narrows via `event instanceof <EventClass>` to pick the right shape. The handler's `R` widens to include whatever Tags it actually uses (`UnitOfWork | DispatchJobBroker | AggregateRegistry`).

**HMAC verification.** Every `/processes/*` request and every dispatch-target route (e.g. `/shipments`, `/fulfilments/:id/link-shipment`) is verified by `flowcatalystWebhookAuthHook`:
- Signing scheme: HMAC-SHA256 over `${X-FlowCatalyst-Timestamp}${rawBody}`, hex-encoded, sent as `X-FlowCatalyst-Signature`. Mirrors the Laravel SDK's `WebhookValidator`.
- Tolerance: 300s past, 60s future grace.
- Constant-time comparison via `timingSafeEqual`.
- Failure → HTTP 401 with the failing code.
- Raw body comes from the JSON content-type parser registered in `server.ts`, which stashes `request.rawBody` before parsing.
- Dev-mode bypass: when `FLOWCATALYST_SIGNING_SECRET` is unset, the hook logs a per-request warning and skips. **Never deploy without setting the secret** — production should fail closed.

**Wiring a new process or event end-to-end**:

1. **Decide what the action does.** If it writes a different aggregate or is operationally independent → it gets its own use case + dispatch-target route. If it's a single write to the same aggregate the event came from → it can live inline in the handler.
2. **Sync definitions**: add any new event type to `flowcatalyst/<subdomain>/events.ts`. Add the eventTypeCode to the existing process subscription's `eventTypes` array — don't add a new subscription for each event.
3. **Per-event handler use case**: standard Effect use case shape returning a sealed event (or a union of sealed events). For each cross-aggregate action, yield `DispatchJobBroker.emit(CreateDispatchJobDto.create(source, code, `${publicBaseUrl}/<action-path>`, payload, dispatchPoolCode)...)`.
4. **Dispatch-target route + use case**: standard user-facing-style route + Effect use case. Add HMAC `preHandler` to the route options (or register inside a plugin scope that has the hook).
5. **Process webhook switch**: add a new `case` for the event type, calling the handler.
6. **Run `pnpm flowcatalyst:sync`** in CI/CD so the subscription's updated `eventTypes` list registers with the platform.

### Tagged Errors

`UseCaseError` is a union of `Data.TaggedError` classes from the SDK's Effect surface:

```typescript
type UseCaseError =
  | ValidationError        // _tag: 'ValidationError'        → 400
  | NotFoundError          // _tag: 'NotFoundError'          → 404
  | BusinessRuleViolation  // _tag: 'BusinessRuleViolation'  → 409
  | ConcurrencyError       // _tag: 'ConcurrencyError'       → 409
  | AuthorizationError     // _tag: 'AuthorizationError'     → 403
  | InfrastructureError;   // _tag: 'InfrastructureError'    → 500

// Construct with `new ValidationError({ code, message, details? })`.
// HTTP mapping: `httpStatus(error)` (from `@fulfil/framework`).
```

Use cases throw errors with `Effect.fail(new ValidationError({...}))`. At the boundary, `AppContext.runWrite` collapses the error channel via `Effect.result`, returning `Result.Result<A, UseCaseError>`. Routes pattern-match on `Result.isFailure` / `Result.isSuccess`.

For *progressive* recovery inside a use case (rare; most cases match terminally at the route boundary), use `Effect.catchTag('ValidationError', (e) => …)` / `Effect.catchTags({...})`. The type system tracks which tags have been handled and removes them from the residual `E` union.

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

### FlowCatalyst Definitions (sync)

Fulfil declares its FlowCatalyst-platform objects — event types, subscriptions, dispatch pools, roles — in code under `packages/server/src/flowcatalyst/`. A `pnpm flowcatalyst:sync` script pushes them to the platform via the SDK's `client.definitions().sync(definitions)` API. Sync is a **CI/CD step**, NOT an app-bootstrap step (races between replicas, wasted load).

Application code on the platform = `'fulfil'` (matches the outbox `clientId`). Reactor subscription targets are built from `FULFIL_PUBLIC_BASE_URL` at sync time.

Layout:

```
flowcatalyst/
├── index.ts                       # buildFulfilDefinitions(config) → DefinitionSet
└── lastmile/
    ├── events.ts                  # EventTypeDefinitions for this subdomain
    ├── subscriptions.ts           # SubscriptionDefinitions (target = reactor URL)
    ├── dispatch-pools.ts          # DispatchPoolDefinitions
    └── roles.ts                   # RoleDefinitions with 4-part permission codes
```

Required env for the sync script: `FLOWCATALYST_URL`, `FLOWCATALYST_CLIENT_ID`, `FLOWCATALYST_CLIENT_SECRET`, `FULFIL_PUBLIC_BASE_URL`. Optional: `FULFIL_DISPATCH_POOL` (default `fulfil-default`), `FLOWCATALYST_REMOVE_UNLISTED=true` to clean up SDK-sourced rows missing from the current set.

Required env on the **running server**: `FLOWCATALYST_SIGNING_SECRET` — shared secret used to verify inbound webhook signatures. Same secret on Fulfil and on the FlowCatalyst connection that signs deliveries. Leaving it unset disables verification (dev-mode bypass with a warning per request).

Event type codes follow `<app>:<subdomain>:<aggregate>:<event>` lowercase + past-tense (`fulfil:lastmile:fulfilment:created`). Permissions follow `<domain>:<area>:<resource>:<action>` (`fulfil:lastmile:fulfilment:create`). The TS-side `LastMilePermission` catalog stores the authorize-check tokens used by use cases; the platform-side names sync'd here are separate strings, intentionally — real authz binding (token → role → permission check) lives in a future slice.

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
- Use proper HTTP status codes mapped from `error._tag` via `httpStatus(error)`:
  - `ValidationError` → 400
  - `AuthorizationError` → 403
  - `NotFoundError` → 404
  - `BusinessRuleViolation` / `ConcurrencyError` → 409
  - `InfrastructureError` → 500

### Repository Pattern

- Repository interfaces defined in `domain/` — pure TypeScript interfaces
- Implementations in `infrastructure/` using Drizzle
- Repositories return domain types, not Drizzle row types
- Read operations: queries (no Scope needed)
- Write operations: go through UnitOfWork, never called directly from routes

### Error Handling

- Business logic errors: `Effect.fail(new ValidationError({...}))` (or any tagged `UseCaseError` class) — never throw
- Infrastructure boundaries (DB calls, network) inside a use case: wrap with `Effect.tryPromise({ try, catch: (cause) => new InfrastructureError(...) })`. Don't `await` raw Promises inside `Effect.gen`.
- Unhandled throws: bubble up as Effect defects → `Effect.runPromise` rejects → Fastify's default error handler returns 500
- Use `Effect.catchTag` / `Effect.catchTags` for *progressive* recovery; the type system removes handled tags from the residual `E`
- No `try/catch` in use cases for business logic flow

### Logging

- Use Pino structured logging (comes with Fastify)
- Log with context: always include `correlationId`, `executionId`, `principalId` from the `Scope` in `ScopeStore`
- Log levels: `error` for failures, `warn` for degraded state, `info` for business events, `debug` for development
- No `console.log` — always use the logger

### Testing

- Vitest for all packages
- Use cases tested with `TestUnitOfWork.layer(buffer)` from `@flowcatalyst/sdk/effect/usecase` — records emitted events into an array without persisting. Provide it (and an `AggregateRegistry` fake) to the program at the test boundary.
- Repository fakes, not mocks
- Schemas tested for validation edge cases
- API routes tested via Fastify's `inject()` method

### Dependencies & Imports

- **`@flowcatalyst/sdk/effect/usecase` is the source of truth** for use-case primitives:
  - Tags: `UnitOfWork`, `ExecutionContext`
  - Types: `Sealed`, `UseCase`, `Command`, `Aggregate`, `UseCaseError`, `DomainEventBase`
  - Tagged errors: `ValidationError`, `NotFoundError`, `BusinessRuleViolation`, `ConcurrencyError`, `AuthorizationError`, `InfrastructureError`
  - Helpers: `httpStatus`, `DomainEvent`, `BaseDomainEvent`
  - Layer factories: `OutboxUnitOfWork.layer`, `TestUnitOfWork.layer`
- **Root `@flowcatalyst/sdk`** for non-Effect surface: `OutboxManager`, `OutboxDriver`, `OutboxMessage`, `CreateEventDto`, `CreateAuditLogDto`, `CreateDispatchJobDto`, `generateTsid`, `isValidTsid`, `FlowCatalystClient`
- **`@fulfil/framework` re-exports** the SDK's Effect-surface primitives and adds Fulfil-specific infrastructure: `Scope`, `ScopeStore`, `runJob`, `SlaTracker`, `NoticeService`, `CacheManager`, `ScopeAwareDrizzleLogger`, `frameworkFastifyPlugin`, `metrics`. Server code imports from `@fulfil/framework` for both.
- **`effect` (v4 beta)** is a peer dep of `@fulfil/framework`. Pin without caret — `effect@4.0.0-beta.66` — because beta commit-hashed prereleases sort higher than the numbered beta under SemVer.
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

- Never bypass UnitOfWork for write operations — no direct repository writes from routes. The `Sealed<E>` brand makes this a **compile error**.
- Never construct `Sealed<E>` outside the SDK's UoW layer — the brand symbol is package-private. If you find yourself reaching for an `as Sealed<E>` cast, the design is wrong.
- Never create events outside of UnitOfWork — the outbox insert must be in the same transaction
- Never run code without identity — every path sets a `Scope` in `ScopeStore` (AsyncLocalStorage). Effect's `ExecutionContext` Tag is not used; `ScopeStore.require()` is the single source.
- Never write to the outbox or persist aggregates outside `AppContext.runWrite` — the `DrizzleOutboxDriver` reads tx from `TransactionStore` and throws when unbound
- Never duplicate the SDK's use-case primitives in `@fulfil/framework` — re-export them instead
- Never hand-write OpenAPI — it comes from TypeBox schemas
- Never use `any` — use `unknown` and type guards
- Never throw for business logic flow — use `Effect.fail(new TaggedError(...))`
- Never `await` raw Promises inside `Effect.gen` — wrap with `Effect.tryPromise({ try, catch })`
- Never use `console.log` — use Pino logger
- Never put business logic in route handlers — they are thin wrappers around `useCase.execute(command)` + `appContext.runWrite(...)`
