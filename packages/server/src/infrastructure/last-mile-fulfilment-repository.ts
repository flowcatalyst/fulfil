import { and, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type {
  CollectionPoint,
  SourceNoteType,
  TemperatureZone,
} from '@fulfil/shared';
import type {
  LastMileFulfilmentId,
  TenantId,
} from '../domain/lastmile/ids.js';
import type { LastMileFulfilment } from '../domain/lastmile/last-mile-fulfilment.js';
import type { LastMileFulfilmentRepository } from '../domain/lastmile/last-mile-fulfilment.repository.js';
import type {
  FulfilmentStatePayload,
  LinkedShipment,
  ReactionBookkeeping,
} from '../domain/lastmile/state.js';
import {
  lastMileFulfilments,
  type LastMileFulfilmentRow,
  type NewLastMileFulfilmentRow,
} from './schema/last-mile-fulfilments.js';

export function createDrizzleLastMileFulfilmentRepository(
  db: PostgresJsDatabase,
): LastMileFulfilmentRepository {
  return {
    async persist(aggregate, tx): Promise<LastMileFulfilment> {
      const client = tx?.db ?? db;
      const row = toRow(aggregate);
      const [saved] = await client
        .insert(lastMileFulfilments)
        .values(row)
        .returning();

      if (!saved) {
        throw new Error(
          `Failed to persist last-mile fulfilment ${aggregate.id}`,
        );
      }
      return toAggregate(saved);
    },

    async delete(aggregate, tx): Promise<boolean> {
      const client = tx?.db ?? db;
      const result = await client
        .delete(lastMileFulfilments)
        .where(
          and(
            eq(lastMileFulfilments.id, aggregate.id),
            eq(lastMileFulfilments.tenantId, aggregate.tenantId),
          ),
        )
        .returning({ id: lastMileFulfilments.id });
      return result.length > 0;
    },

    async findById(tenantId, id): Promise<LastMileFulfilment | null> {
      const rows = await db
        .select()
        .from(lastMileFulfilments)
        .where(
          and(
            eq(lastMileFulfilments.tenantId, tenantId),
            eq(lastMileFulfilments.id, id),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? toAggregate(row) : null;
    },

    async findActiveBySourceNote(
      tenantId,
      sourceNoteSystem,
      sourceNoteType,
      sourceNoteNumber,
    ): Promise<LastMileFulfilment | null> {
      const rows = await db
        .select()
        .from(lastMileFulfilments)
        .where(
          and(
            eq(lastMileFulfilments.tenantId, tenantId),
            eq(lastMileFulfilments.sourceNoteSystem, sourceNoteSystem),
            eq(lastMileFulfilments.sourceNoteType, sourceNoteType),
            eq(lastMileFulfilments.sourceNoteNumber, sourceNoteNumber),
            isNull(lastMileFulfilments.terminatedAt),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? toAggregate(row) : null;
    },
  };
}

// ─── Row ↔ aggregate mapping ────────────────────────────────────────────────

function toRow(a: LastMileFulfilment): NewLastMileFulfilmentRow {
  return {
    id: a.id,
    tenantId: a.tenantId,
    sourceNoteSystem: a.sourceNote.system,
    sourceNoteType: a.sourceNote.type,
    sourceNoteNumber: a.sourceNote.number,
    sourceNoteRevision: a.sourceNote.revision,
    orderRefSystem: a.orderRef?.system ?? null,
    orderRefNumber: a.orderRef?.number ?? null,
    stage: a.state.stage,
    statePayload: a.state,
    collection: a.collection,
    dropOff: a.dropOff,
    consignee: a.consignee,
    promisedWindowStart: a.promisedWindow.start,
    promisedWindowEnd: a.promisedWindow.end,
    temperatureZone: a.temperatureZone,
    handling: [...a.handling],
    lines: [...a.lines],
    parcels: [...a.parcels],
    linkedShipments: [...a.linkedShipments],
    reaction: a.reaction,
    plannedAt: extractPlannedAt(a.state),
    deliveredAt: extractDeliveredAt(a.state),
    terminatedAt: extractTerminatedAt(a.state),
    metadata: a.metadata,
    version: a.version,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function toAggregate(row: LastMileFulfilmentRow): LastMileFulfilment {
  return {
    id: row.id as LastMileFulfilmentId,
    tenantId: row.tenantId as TenantId,
    sourceNote: {
      system: row.sourceNoteSystem,
      type: row.sourceNoteType as SourceNoteType,
      number: row.sourceNoteNumber,
      revision: row.sourceNoteRevision,
    },
    orderRef:
      row.orderRefSystem !== null && row.orderRefNumber !== null
        ? { system: row.orderRefSystem, number: row.orderRefNumber }
        : null,
    collection: reviveCollectionPointDates(row.collection),
    dropOff: row.dropOff,
    consignee: row.consignee,
    promisedWindow: {
      start: row.promisedWindowStart,
      end: row.promisedWindowEnd,
    },
    lines: row.lines,
    parcels: row.parcels,
    temperatureZone: row.temperatureZone as TemperatureZone,
    handling: row.handling,
    linkedShipments: row.linkedShipments.map(reviveLinkedShipmentDates),
    state: reviveStatePayloadDates(row.statePayload),
    reaction: reviveReactionDates(row.reaction),
    metadata: row.metadata,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Denormalised-column extractors (state → flat columns) ──────────────────

function extractPlannedAt(s: FulfilmentStatePayload): Date | null {
  return s.stage === 'planned' ? s.plannedAt : null;
}

function extractDeliveredAt(s: FulfilmentStatePayload): Date | null {
  return s.stage === 'delivered' ? s.deliveredAt : null;
}

function extractTerminatedAt(s: FulfilmentStatePayload): Date | null {
  switch (s.stage) {
    case 'delivered':
      return s.deliveredAt;
    case 'partially_delivered':
      return s.completedAt;
    case 'completed_with_exceptions':
      return s.resolvedAt;
    case 'failed':
      return s.failedAt;
    case 'cancelled':
      return s.cancelledAt;
    case 'escalated':
      return s.escalatedAt;
    case 'abandoned':
      return s.abandonedAt;
    default:
      return null;
  }
}

// ─── Date revival for nested JSONB ──────────────────────────────────────────
// JSONB serialises Date → ISO string on write; postgres-js returns the strings
// on read. These helpers restore Date instances where the aggregate expects them.

function reviveDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  throw new TypeError(
    `expected Date or ISO string, got ${typeof value}: ${String(value)}`,
  );
}

function reviveDateOrNull(value: unknown): Date | null {
  return value === null || value === undefined ? null : reviveDate(value);
}

function reviveCollectionPointDates(cp: CollectionPoint): CollectionPoint {
  if (!cp.collectionWindow) return cp;
  return {
    ...cp,
    collectionWindow: {
      start: reviveDate(cp.collectionWindow.start),
      end: reviveDate(cp.collectionWindow.end),
    },
  };
}

function reviveLinkedShipmentDates(ls: LinkedShipment): LinkedShipment {
  return { ...ls, linkedAt: reviveDate(ls.linkedAt) };
}

function reviveReactionDates(r: ReactionBookkeeping): ReactionBookkeeping {
  return {
    awaitingEventType: r.awaitingEventType,
    awaitingDeadline: reviveDateOrNull(r.awaitingDeadline),
    lastHandledEventId: r.lastHandledEventId,
    lastReactionAt: reviveDateOrNull(r.lastReactionAt),
  };
}

function reviveStatePayloadDates(
  s: FulfilmentStatePayload,
): FulfilmentStatePayload {
  switch (s.stage) {
    case 'awaiting_planning':
      return s;
    case 'planned':
      return { stage: 'planned', plannedAt: reviveDate(s.plannedAt) };
    case 'in_progress':
      return { stage: 'in_progress', startedAt: reviveDate(s.startedAt) };
    case 'delivered':
      return { stage: 'delivered', deliveredAt: reviveDate(s.deliveredAt) };
    case 'partially_delivered':
      return {
        stage: 'partially_delivered',
        completedAt: reviveDate(s.completedAt),
        successfulShipmentIds: s.successfulShipmentIds,
        failedShipmentIds: s.failedShipmentIds,
      };
    case 'completed_with_exceptions':
      return {
        stage: 'completed_with_exceptions',
        resolvedAt: reviveDate(s.resolvedAt),
        summary: s.summary,
      };
    case 'failed':
      return {
        stage: 'failed',
        failedAt: reviveDate(s.failedAt),
        reason: s.reason,
      };
    case 'cancelled':
      return {
        stage: 'cancelled',
        cancelledAt: reviveDate(s.cancelledAt),
        cancelledBy: s.cancelledBy,
        reason: s.reason,
      };
    case 'escalated':
      return {
        stage: 'escalated',
        escalatedAt: reviveDate(s.escalatedAt),
        exception: s.exception,
      };
    case 'abandoned':
      return {
        stage: 'abandoned',
        abandonedAt: reviveDate(s.abandonedAt),
        reason: s.reason,
      };
  }
}
