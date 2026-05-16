import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type {
  CollectionPoint,
  ShipmentStatus,
  TemperatureZone,
} from '@fulfil/shared';
import type {
  LastMileFulfilmentId,
  ShipmentId,
  TenantId,
  TripId,
} from '../domain/lastmile/ids.js';
import type { LastMileShipment } from '../domain/lastmile/last-mile-shipment.js';
import type { LastMileShipmentRepository } from '../domain/lastmile/last-mile-shipment.repository.js';
import {
  lastMileShipments,
  type LastMileShipmentRow,
  type NewLastMileShipmentRow,
} from './schema/last-mile-shipments.js';

export function createDrizzleLastMileShipmentRepository(
  db: PostgresJsDatabase,
): LastMileShipmentRepository {
  return {
    async persist(aggregate, tx): Promise<LastMileShipment> {
      const client = tx?.db ?? db;
      const row = toRow(aggregate);
      const [saved] = await client
        .insert(lastMileShipments)
        .values(row)
        .returning();

      if (!saved) {
        throw new Error(`Failed to persist last-mile shipment ${aggregate.id}`);
      }
      return toAggregate(saved);
    },

    async delete(aggregate, tx): Promise<boolean> {
      const client = tx?.db ?? db;
      const result = await client
        .delete(lastMileShipments)
        .where(
          and(
            eq(lastMileShipments.id, aggregate.id),
            eq(lastMileShipments.tenantId, aggregate.tenantId),
          ),
        )
        .returning({ id: lastMileShipments.id });
      return result.length > 0;
    },

    async findById(tenantId, id): Promise<LastMileShipment | null> {
      const rows = await db
        .select()
        .from(lastMileShipments)
        .where(
          and(
            eq(lastMileShipments.tenantId, tenantId),
            eq(lastMileShipments.id, id),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? toAggregate(row) : null;
    },

    async findByFulfilment(
      tenantId,
      fulfilmentId,
    ): Promise<readonly LastMileShipment[]> {
      const rows = await db
        .select()
        .from(lastMileShipments)
        .where(
          and(
            eq(lastMileShipments.tenantId, tenantId),
            eq(lastMileShipments.fulfilmentId, fulfilmentId),
          ),
        );
      return rows.map(toAggregate);
    },
  };
}

// ─── Row ↔ aggregate mapping ────────────────────────────────────────────────

function toRow(a: LastMileShipment): NewLastMileShipmentRow {
  return {
    id: a.id,
    tenantId: a.tenantId,
    fulfilmentId: a.fulfilmentId,
    collection: a.collection,
    dropOff: a.dropOff,
    consignee: a.consignee,
    promisedWindowStart: a.promisedWindow.start,
    promisedWindowEnd: a.promisedWindow.end,
    temperatureZone: a.temperatureZone,
    handling: [...a.handling],
    lines: [...a.lines],
    parcels: [...a.parcels],
    tripId: a.trip?.tripId ?? null,
    status: a.status,
    metadata: a.metadata,
    version: a.version,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function toAggregate(row: LastMileShipmentRow): LastMileShipment {
  return {
    id: row.id as ShipmentId,
    tenantId: row.tenantId as TenantId,
    fulfilmentId: row.fulfilmentId as LastMileFulfilmentId,
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
    trip: row.tripId ? { tripId: row.tripId as TripId } : null,
    status: row.status as ShipmentStatus,
    metadata: row.metadata,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function reviveDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  throw new TypeError(
    `expected Date or ISO string, got ${typeof value}: ${String(value)}`,
  );
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
