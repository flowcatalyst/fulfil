import { usecase, generateTsid } from '@flowcatalyst/sdk';
import {
  Result,
  ScopeStore,
  UseCaseError,
  type Scope,
  type UnitOfWork,
} from '@fulfil/framework';
import { LastMilePermission } from '@fulfil/shared';
import type {
  Parcel,
  ParcelDraft,
  PromisedLine,
  PromisedLineDraft,
} from '@fulfil/shared';

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
 *    (stubbed — see `authorizeResource` below).
 *  - One active fulfilment per `(tenant, sourceNote.system, type, number)`.
 *  - Promised delivery window end must be in the future.
 *  - Each line has positive quantity; line IDs (if caller-provided) are unique.
 *  - Each parcel has positive weight; any `lineRefs` resolve to declared lines.
 *
 * Does NOT hydrate master data — the caller (UI/controller/adapter) supplies
 * the `CollectionPoint`, `DropOffPoint`, `Consignee` value objects already
 * populated.
 */
export class CreateLastMileFulfilmentUseCase extends usecase.SecuredUseCase<
  CreateLastMileFulfilmentCommand,
  LastMileFulfilmentCreated
> {
  static readonly requiredPermission = LastMilePermission.CreateLastMileFulfilment;

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly fulfilments: LastMileFulfilmentRepository,
  ) {
    super();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TODO(auth): replace this stub with a real permission check against the
  // principal's grants for `LastMilePermission.CreateLastMileFulfilment`,
  // scoped to `scope.tenant.tenantId`. For now this grants unconditionally
  // within a tenant context; the base `execute()` still enforces deny-by-default
  // if this method returns false.
  // ───────────────────────────────────────────────────────────────────────────
  override authorizeResource(
    _command: CreateLastMileFulfilmentCommand,
    _context: usecase.ExecutionContext,
  ): boolean {
    return true;
  }

  override async doExecute(
    command: CreateLastMileFulfilmentCommand,
    _context: usecase.ExecutionContext,
  ): Promise<Result<LastMileFulfilmentCreated>> {
    const scope = ScopeStore.require();

    // 1. Business-rule validation. Structural validation is done at the API
    //    edge by Zod before the command arrives here.
    const validationError = await this.validate(command, scope);
    if (validationError) return Result.failure(validationError);

    // validate() guarantees tenant is present.
    const tenantId = asTenantId(scope.tenant!.tenantId);
    const now = new Date();

    // 2. Build the aggregate directly from the fully-hydrated command.
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
      now,
    });

    // 3. Build the event. Carries enough for downstream planners + read-models
    //    without requiring them to fetch the aggregate back. Metadata rides
    //    along verbatim — Fulfil never inspects it.
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

    // 4. Atomic commit — persists the aggregate + writes event to outbox +
    //    writes local audit log, all within one Drizzle transaction.
    return this.unitOfWork.commitAggregate(fulfilment, event, command);
  }

  private async validate(
    command: CreateLastMileFulfilmentCommand,
    scope: Scope,
  ): Promise<UseCaseError | null> {
    if (!scope.tenant) {
      return UseCaseError.validation(
        'TENANT_REQUIRED',
        'LastMile fulfilments must be created within a tenant context.',
      );
    }
    const tenantId = asTenantId(scope.tenant.tenantId);

    // Cross-field shape rules — JSON Schema at the wire can't express these,
    // so they live here alongside the other business invariants.
    if (command.promisedWindow.end <= command.promisedWindow.start) {
      return UseCaseError.validation(
        'PROMISED_WINDOW_INVALID',
        'promisedWindow.end must be after promisedWindow.start.',
      );
    }
    if (command.collection.collectionWindow) {
      const cw = command.collection.collectionWindow;
      if (cw.end <= cw.start) {
        return UseCaseError.validation(
          'COLLECTION_WINDOW_INVALID',
          'collection.collectionWindow.end must be after collection.collectionWindow.start.',
        );
      }
    }

    const existing = await this.fulfilments.findActiveBySourceNote(
      tenantId,
      command.sourceNote.system,
      command.sourceNote.type,
      command.sourceNote.number,
    );
    if (existing) {
      return UseCaseError.businessRule(
        'SOURCE_NOTE_IN_FLIGHT',
        `An active fulfilment already exists for ${command.sourceNote.system}/${command.sourceNote.type}/${command.sourceNote.number}.`,
        { existingFulfilmentId: existing.id },
      );
    }

    if (command.promisedWindow.end < new Date()) {
      return UseCaseError.validation(
        'PROMISED_WINDOW_IN_PAST',
        'promisedWindow.end is in the past.',
      );
    }

    const declaredLineIds = new Set<string>();
    for (const line of command.lines ?? []) {
      if (line.quantity <= 0) {
        return UseCaseError.validation(
          'LINE_QUANTITY_NON_POSITIVE',
          `Line "${line.sku}" has non-positive quantity.`,
        );
      }
      if (line.lineId !== undefined) {
        if (declaredLineIds.has(line.lineId)) {
          return UseCaseError.validation(
            'DUPLICATE_LINE_ID',
            `Duplicate lineId ${line.lineId} in command.`,
          );
        }
        declaredLineIds.add(line.lineId);
      }
    }

    for (const parcel of command.parcels ?? []) {
      if (parcel.weightGrams <= 0) {
        return UseCaseError.validation(
          'PARCEL_WEIGHT_NON_POSITIVE',
          `Parcel "${parcel.label ?? '<unlabelled>'}" has non-positive weight.`,
        );
      }
      for (const ref of parcel.lineRefs) {
        if (!declaredLineIds.has(ref)) {
          return UseCaseError.validation(
            'PARCEL_LINE_REF_UNKNOWN',
            `Parcel references unknown lineId ${ref}.`,
          );
        }
      }
    }

    return null;
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
