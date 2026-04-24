# FlowCatalyst SDK Changes Spec

This document specifies the changes required in the FlowCatalyst TypeScript SDK to support the `@fulfil/framework` integration points.

---

## 1. Config Service

### Overview

A `ConfigClient` in the SDK that fetches application config from the FlowCatalyst API, validates it, and caches it locally.

### API

```typescript
// Define a config
const MyConfig = configClient.define({
  key: 'rate-limits',
  scope: 'subdomain',
  schema: z.object({
    requestsPerMinute: z.number().int().positive(),
    burstLimit: z.number().int().positive(),
  }),
});

// Fetch a validated config value
const config = await configClient.get(MyConfig);
// config.requestsPerMinute: number
```

### Config Definition

```typescript
interface ConfigDefinition<T> {
  readonly key: string;
  readonly scope: 'application' | 'subdomain' | 'aggregate';
  readonly schema: ZodSchema<T>;
  readonly encrypted?: boolean;
  readonly ttlSeconds?: number;  // default: 1800 (30 minutes)
}
```

### Scope

Configs are linkable to:

- `application` — applies to all instances of this application
- `subdomain` — scoped to the specific deployment/environment
- `aggregate` — scoped to a specific aggregate type (e.g. per-tenant or per-route overrides)

### Storage

- **Plain text**: default — value stored and returned as-is
- **Encrypted**: FlowCatalyst API handles encryption/decryption; SDK receives plaintext over TLS. Plaintext is cached in-process only (not persisted to disk or Redis).

### Caching

- **Backend**: in-process (`Map`). The consuming application can provide a custom `CacheStore` from `@fulfil/framework` for shared cache (e.g. Redis).
- **TTL**: configurable per definition, defaults to 30 minutes.
- **Invalidation**: TTL-based only in v1. Webhook push invalidation is a v2 concern.

### Error handling

- If the key does not exist on the platform: throws `ConfigNotFoundError`
- If the fetched value fails schema validation: throws `ConfigValidationError`
- If the platform is unreachable and no cached value exists: throws `ConfigFetchError`

### `ConfigClient` interface

```typescript
interface ConfigClient {
  get<T>(definition: ConfigDefinition<T>): Promise<T>;
  invalidate(key: string): void;
}

function createConfigClient(options: {
  httpClient: FlowCatalystClient;
  cache?: CacheStore;  // from @fulfil/framework, defaults to in-process Map
}): ConfigClient;
```

---

## 2. Notice Event Integration

### Overview

When a `Notice` is captured with `emitEvent: true`, the framework emits a structured event to the FlowCatalyst platform via the outbox. This enables downstream consumers to react to notices (e.g. alerting, dashboards, audit trails).

### Integration Point

`NoticeService` (in `@fulfil/framework`) exposes an `onEmitEvent` hook:

```typescript
const noticeService = createNoticeService({
  repository: noticeRepository,
  onEmitEvent: (notice) => outboxManager.createEvent(NoticeEvent.from(notice)),
});
```

The server wires this at startup. The SDK provides `NoticeEvent.from()`.

### Event Definition

**Event type**: `flowcatalyst:platform:notice:{level}` (e.g. `flowcatalyst:platform:notice:error`)

**TypeBox schema** (defined in the SDK):

```typescript
const NoticeEventData = Type.Object({
  id: Type.String(),
  message: Type.String(),
  level: Type.Union([Type.Literal('info'), Type.Literal('warn'), Type.Literal('error')]),
  code: Type.String(),
  aggregateType: Type.Union([Type.String(), Type.Null()]),
  aggregateId: Type.Union([Type.String(), Type.Null()]),
  metadata: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
  correlationId: Type.String(),
  principalId: Type.String(),
  tenantId: Type.Union([Type.String(), Type.Null()]),
  capturedAt: Type.String({ format: 'date-time' }),
});
```

### `NoticeEvent` helper

```typescript
class NoticeEvent extends BaseDomainEvent<Static<typeof NoticeEventData>> {
  static from(notice: Notice): NoticeEvent;
}
```

`NoticeEvent.from(notice)` constructs the event from the current scope (via `ScopeStore`). Subject and messageGroup use the notice `id`.

### Wiring in server.ts

```typescript
const outboxManager = new OutboxManager(outboxDriver, clientId);

const noticeService = createNoticeService({
  repository: createDrizzleNoticeRepository(db),
  onEmitEvent: async (notice) => {
    await outboxManager.createEvent(
      NoticeEvent.from(notice).toCreateEventDto(),
    );
  },
});
```

---

## Notes

- SDK cleanup (removing unused exports, consolidating types) is deferred — no deletions until all consuming services are audited.
