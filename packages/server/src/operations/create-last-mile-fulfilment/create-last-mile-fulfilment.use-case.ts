import { Effect } from 'effect';
import { generateTsid } from '@flowcatalyst/sdk';
import {
  AuthorizationError,
  BusinessRuleViolation,
  ScopeStore,
  type UnitOfWork,
  ValidationError,
  type Sealed,
  type UseCaseError,
} from '@fulfil/framework';
import { LastMilePermission } from '@fulfil/shared';
import type {
  Parcel,
  ParcelDraft,
  PromisedLine,
  PromisedLineDraft,
} from '@fulfil/shared';

import {
  AggregateRegistry,
  commitAggregate,
} from '../../infrastructure/unit-of-work.js';
import {
  asLastMileFulfilmentId,
  asTenantId,
  LAST_MILE_FULFILMENT_ID_PREFIX,
  PARCEL_ID_PREFIX,
  PROMISED_LINE_ID_PREFIX,
} from '../../domain/lastmile/ids.js';
import { LastMileFulfilment } from '../../domain/lastmile/last-mile-fulfilment.js';
import type { LastMileFulfilmentRepository } from '../../domain/lastmile/last-mile-fulfilment.repository.js';
import { LastMileFulfilmentCreated } from '../../domain/lastmile/events/last-mile-fulfilment-created.event.js';

import type { CreateLastMileFulfilmentCommand } from './create-last-mile-fulfilment.command.js';

/**
 * Create a new `LastMileFulfilment` from a fully-hydrated command.
 *
 * Rules this use case enforces:
 *  - Authorization: requires `LastMilePermission.CreateLastMileFulfilment`
 *    (stubbed — see `authorize` below).
 *  - One active fulfilment per `(tenant, sourceNote.system, type, number)`.
 *  - Promised delivery window end must be in the future.
 *  - Each line has positive quantity; line IDs (if caller-provided) are unique.
 *  - Each parcel has positive weight; any `lineRefs` resolve to declared lines.
 *
 * Does NOT hydrate master data — the caller (UI/controller/adapter) supplies
 * the `CollectionPoint`, `DropOffPoint`, `Consignee` value objects already
 * populated.
 *
 * Identity binding: the use case reads `Scope` from `ScopeStore` (ALS).
 * Tenancy lives on the scope; the five tracing fields are passed to the
 * domain event constructor. This is why `R = UnitOfWork | AggregateRegistry`
 * — no Effect `ExecutionContext` is needed: ALS is the single source.
 */
export class CreateLastMileFulfilmentUseCase {
  static readonly requiredPermission =
    LastMilePermission.CreateLastMileFulfilment;

  constructor(private readonly fulfilments: LastMileFulfilmentRepository) {}

  execute = (
    command: CreateLastMileFulfilmentCommand,
  ): Effect.Effect<
    Sealed<LastMileFulfilmentCreated>,
    UseCaseError,
    UnitOfWork | AggregateRegistry
  > => {
    const fulfilments = this.fulfilments;
    const authorize = (): boolean => this.authorize();

    return Effect.gen(function* () {
      const scope = ScopeStore.require();

      // 1. Authorization. Stub for now — see TODO(auth) below.
      if (!authorize()) {
        return yield* Effect.fail(
          new AuthorizationError({
            code: 'PERMISSION_DENIED',
            message: `Missing permission ${LastMilePermission.CreateLastMileFulfilment}.`,
          }),
        );
      }

      // 2. Tenant must be present on the scope.
      if (!scope.tenant) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'TENANT_REQUIRED',
            message:
              'LastMile fulfilments must be created within a tenant context.',
          }),
        );
      }
      const tenantId = asTenantId(scope.tenant.tenantId);

      // 3. Cross-field shape rules — JSON Schema at the wire can't express
      //    these, so they live alongside the other business invariants.
      if (command.promisedWindow.end <= command.promisedWindow.start) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'PROMISED_WINDOW_INVALID',
            message:
              'promisedWindow.end must be after promisedWindow.start.',
          }),
        );
      }
      if (command.collection.collectionWindow) {
        const cw = command.collection.collectionWindow;
        if (cw.end <= cw.start) {
          return yield* Effect.fail(
            new ValidationError({
              code: 'COLLECTION_WINDOW_INVALID',
              message:
                'collection.collectionWindow.end must be after collection.collectionWindow.start.',
            }),
          );
        }
      }

      if (command.promisedWindow.end < new Date()) {
        return yield* Effect.fail(
          new ValidationError({
            code: 'PROMISED_WINDOW_IN_PAST',
            message: 'promisedWindow.end is in the past.',
          }),
        );
      }

      // 4. Line + parcel invariants.
      const declaredLineIds = new Set<string>();
      for (const line of command.lines ?? []) {
        if (line.quantity <= 0) {
          return yield* Effect.fail(
            new ValidationError({
              code: 'LINE_QUANTITY_NON_POSITIVE',
              message: `Line "${line.sku}" has non-positive quantity.`,
            }),
          );
        }
        if (line.lineId !== undefined) {
          if (declaredLineIds.has(line.lineId)) {
            return yield* Effect.fail(
              new ValidationError({
                code: 'DUPLICATE_LINE_ID',
                message: `Duplicate lineId ${line.lineId} in command.`,
              }),
            );
          }
          declaredLineIds.add(line.lineId);
        }
      }

      for (const parcel of command.parcels ?? []) {
        if (parcel.weightGrams <= 0) {
          return yield* Effect.fail(
            new ValidationError({
              code: 'PARCEL_WEIGHT_NON_POSITIVE',
              message: `Parcel "${parcel.label ?? '<unlabelled>'}" has non-positive weight.`,
            }),
          );
        }
        for (const ref of parcel.lineRefs) {
          if (!declaredLineIds.has(ref)) {
            return yield* Effect.fail(
              new ValidationError({
                code: 'PARCEL_LINE_REF_UNKNOWN',
                message: `Parcel references unknown lineId ${ref}.`,
              }),
            );
          }
        }
      }

      // 5. Uniqueness check. The repository read runs in the same Drizzle tx
      //    as the eventual write (we're inside AppContext.runWrite).
      const existing = yield* Effect.tryPromise({
        try: () =>
          fulfilments.findActiveBySourceNote(
            tenantId,
            command.sourceNote.system,
            command.sourceNote.type,
            command.sourceNote.number,
          ),
        catch: (cause) =>
          new BusinessRuleViolation({
            code: 'REPO_READ_FAILED',
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      });
      if (existing) {
        return yield* Effect.fail(
          new BusinessRuleViolation({
            code: 'SOURCE_NOTE_IN_FLIGHT',
            message: `An active fulfilment already exists for ${command.sourceNote.system}/${command.sourceNote.type}/${command.sourceNote.number}.`,
            details: { existingFulfilmentId: existing.id },
          }),
        );
      }

      // 6. Build the aggregate directly from the fully-hydrated command.
      const fulfilment = LastMileFulfilment.create({
        id: asLastMileFulfilmentId(
          `${LAST_MILE_FULFILMENT_ID_PREFIX}_${generateTsid()}`,
        ),
        tenantId,
        sourceNote: command.sourceNote,
        orderRef: command.orderRef ?? null,
        collection: command.collection,
        dropOff: command.dropOff,
        consignee: command.consignee,
        promisedWindow: command.promisedWindow,
        lines: (command.lines ?? []).map(withGeneratedLineId),
        parcels: (command.parcels ?? []).map(withGeneratedParcelId),
        temperatureZone: command.temperatureZone,
        handling: command.handling,
        metadata: command.metadata,
        now: new Date(),
      });

      // 7. Build the event. Carries enough for downstream planners + read
      //    models without requiring them to fetch the aggregate back.
      const event = new LastMileFulfilmentCreated(scope, {
        fulfilmentId: fulfilment.id,
        tenantId: fulfilment.tenantId,
        sourceNote: fulfilment.sourceNote,
        orderRef: fulfilment.orderRef,
        collection: fulfilment.collection,
        dropOff: fulfilment.dropOff,
        consignee: fulfilment.consignee,
        promisedWindow: fulfilment.promisedWindow,
        lineCount: fulfilment.lines.length,
        parcelCount: fulfilment.parcels.length,
        temperatureZone: fulfilment.temperatureZone,
        handling: fulfilment.handling,
        metadata: fulfilment.metadata,
      });

      // 8. Atomic commit — persists the aggregate, inserts a local audit row,
      //    and writes the outbox event + outbox audit log inside one Drizzle
      //    transaction (bound on ALS by `AppContext.runWrite`).
      return yield* commitAggregate(fulfilment, event, command);
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // TODO(auth): replace this stub with a real permission check against the
  // principal's grants for `LastMilePermission.CreateLastMileFulfilment`,
  // scoped to `scope.tenant.tenantId`. For now this grants unconditionally
  // within a tenant context.
  // ───────────────────────────────────────────────────────────────────────────
  private authorize(): boolean {
    return true;
  }
}

// ─── Local helpers ──────────────────────────────────────────────────────────

function withGeneratedLineId(draft: PromisedLineDraft): PromisedLine {
  return {
    ...draft,
    lineId: draft.lineId ?? `${PROMISED_LINE_ID_PREFIX}_${generateTsid()}`,
  };
}

function withGeneratedParcelId(draft: ParcelDraft): Parcel {
  return {
    ...draft,
    parcelId: draft.parcelId ?? `${PARCEL_ID_PREFIX}_${generateTsid()}`,
  };
}
