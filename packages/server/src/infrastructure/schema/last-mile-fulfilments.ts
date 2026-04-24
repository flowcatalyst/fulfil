import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import type {
  CollectionPoint,
  Consignee,
  DropOffPoint,
  HandlingFlag,
  Metadata,
  Parcel,
  PromisedLine,
} from '@fulfil/shared';
import type {
  FulfilmentStatePayload,
  LinkedShipment,
  ReactionBookkeeping,
} from '../../domain/lastmile/state.js';
import { timestampColumn, tsidColumn } from './common.js';

export const lastMileFulfilments = pgTable(
  'last_mile_fulfilments',
  {
    id: tsidColumn('id').primaryKey(),
    tenantId: varchar('tenant_id', { length: 100 }).notNull(),

    // Source document — denormalised for uniqueness/lookup. See partial unique
    // index below enforcing one active fulfilment per source note.
    sourceNoteSystem: varchar('source_note_system', { length: 100 }).notNull(),
    sourceNoteType: varchar('source_note_type', { length: 50 }).notNull(),
    sourceNoteNumber: varchar('source_note_number', { length: 100 }).notNull(),
    sourceNoteRevision: integer('source_note_revision').notNull().default(1),

    // Optional upstream order ref.
    orderRefSystem: varchar('order_ref_system', { length: 100 }),
    orderRefNumber: varchar('order_ref_number', { length: 100 }),

    // Stage — flat column for indexing; statePayload carries stage-specific
    // data (payload's `stage` key is redundant with this column by design, so
    // the JSONB is self-describing when inspected manually).
    stage: varchar('stage', { length: 40 }).notNull(),
    statePayload: jsonb('state_payload')
      .$type<FulfilmentStatePayload>()
      .notNull(),

    // Value objects — role-specific shapes on this aggregate.
    collection: jsonb('collection').$type<CollectionPoint>().notNull(),
    dropOff: jsonb('drop_off').$type<DropOffPoint>().notNull(),
    consignee: jsonb('consignee').$type<Consignee>().notNull(),

    // Promised window — flat for SLA-window queries.
    promisedWindowStart: timestampColumn('promised_window_start').notNull(),
    promisedWindowEnd: timestampColumn('promised_window_end').notNull(),

    // Cargo profile.
    temperatureZone: varchar('temperature_zone', { length: 20 }).notNull(),
    handling: jsonb('handling')
      .$type<HandlingFlag[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    // Cargo — both arrays start empty; populated via declaration events.
    lines: jsonb('lines')
      .$type<PromisedLine[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    parcels: jsonb('parcels')
      .$type<Parcel[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    // PM linkage to spawned shipments.
    linkedShipments: jsonb('linked_shipments')
      .$type<LinkedShipment[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    // Reaction bookkeeping for the process manager.
    reaction: jsonb('reaction').$type<ReactionBookkeeping>().notNull(),

    // Denormalised lifecycle timestamps for common queries and the
    // partial-unique-open index.
    plannedAt: timestampColumn('planned_at'),
    deliveredAt: timestampColumn('delivered_at'),
    terminatedAt: timestampColumn('terminated_at'),

    // Opaque passthrough — Fulfil never reads this for behaviour.
    metadata: jsonb('metadata')
      .$type<Metadata>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    // Optimistic concurrency.
    version: integer('version').notNull().default(1),

    createdAt: timestampColumn('created_at').notNull().defaultNow(),
    updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    // Lookup: "find the fulfilment for NetSuite delivery-note DN-1234".
    tenantSourceLookupIdx: index('lmf_tenant_source_lookup_idx').on(
      t.tenantId,
      t.sourceNoteSystem,
      t.sourceNoteType,
      t.sourceNoteNumber,
    ),

    // One active fulfilment per source note per tenant. Terminal stages set
    // terminated_at to allow a new fulfilment for the same note (e.g.
    // post-cancel reissue).
    uniqueOpenSource: uniqueIndex('lmf_unique_open_source')
      .on(
        t.tenantId,
        t.sourceNoteSystem,
        t.sourceNoteType,
        t.sourceNoteNumber,
      )
      .where(sql`${t.terminatedAt} is null`),

    stageIdx: index('lmf_stage_idx').on(t.tenantId, t.stage),

    promisedWindowIdx: index('lmf_promised_window_idx').on(
      t.tenantId,
      t.promisedWindowEnd,
    ),

    // GIN index for metadata key lookups ("find by netsuite:poNumber").
    metadataIdx: index('lmf_metadata_idx').using('gin', t.metadata),
  }),
);

export type NewLastMileFulfilmentRow = typeof lastMileFulfilments.$inferInsert;
export type LastMileFulfilmentRow = typeof lastMileFulfilments.$inferSelect;
