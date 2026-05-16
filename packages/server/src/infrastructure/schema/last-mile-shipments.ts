import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, varchar } from 'drizzle-orm/pg-core';
import type {
  CollectionPoint,
  Consignee,
  DropOffPoint,
  HandlingFlag,
  Metadata,
  Parcel,
  PromisedLine,
} from '@fulfil/shared';
import { timestampColumn, tsidColumn } from './common.js';

export const lastMileShipments = pgTable(
  'last_mile_shipments',
  {
    id: tsidColumn('id').primaryKey(),
    tenantId: varchar('tenant_id', { length: 100 }).notNull(),
    fulfilmentId: tsidColumn('fulfilment_id').notNull(),

    // Value objects denormalised from the parent fulfilment at creation time.
    // Stored verbatim so subsequent fulfilment edits don't drift this shipment.
    collection: jsonb('collection').$type<CollectionPoint>().notNull(),
    dropOff: jsonb('drop_off').$type<DropOffPoint>().notNull(),
    consignee: jsonb('consignee').$type<Consignee>().notNull(),

    // Promised window — flat for SLA-window queries.
    promisedWindowStart: timestampColumn('promised_window_start').notNull(),
    promisedWindowEnd: timestampColumn('promised_window_end').notNull(),

    temperatureZone: varchar('temperature_zone', { length: 20 }).notNull(),
    handling: jsonb('handling')
      .$type<HandlingFlag[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    lines: jsonb('lines')
      .$type<PromisedLine[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    parcels: jsonb('parcels')
      .$type<Parcel[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    // Trip linkage — null when shipment isn't yet assigned to a trip.
    tripId: tsidColumn('trip_id'),

    // Status — see ShipmentStatus catalog. Backed by text; no DB enum.
    status: varchar('status', { length: 30 }).notNull(),

    metadata: jsonb('metadata')
      .$type<Metadata>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    version: integer('version').notNull().default(1),

    createdAt: timestampColumn('created_at').notNull().defaultNow(),
    updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    fulfilmentIdx: index('lms_fulfilment_idx').on(t.tenantId, t.fulfilmentId),
    statusIdx: index('lms_status_idx').on(t.tenantId, t.status),
    tripIdx: index('lms_trip_idx').on(t.tenantId, t.tripId),
    promisedWindowIdx: index('lms_promised_window_idx').on(
      t.tenantId,
      t.promisedWindowEnd,
    ),
    metadataIdx: index('lms_metadata_idx').using('gin', t.metadata),
  }),
);

export type NewLastMileShipmentRow = typeof lastMileShipments.$inferInsert;
export type LastMileShipmentRow = typeof lastMileShipments.$inferSelect;
