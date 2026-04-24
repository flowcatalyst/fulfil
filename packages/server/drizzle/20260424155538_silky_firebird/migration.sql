CREATE TABLE "audit_logs" (
	"id" varchar(13) PRIMARY KEY,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" varchar(100) NOT NULL,
	"operation" varchar(200) NOT NULL,
	"operation_json" jsonb,
	"principal_id" varchar(100) NOT NULL,
	"performed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "last_mile_fulfilments" (
	"id" varchar(17) PRIMARY KEY,
	"tenant_id" varchar(100) NOT NULL,
	"source_note_system" varchar(100) NOT NULL,
	"source_note_type" varchar(50) NOT NULL,
	"source_note_number" varchar(100) NOT NULL,
	"source_note_revision" integer DEFAULT 1 NOT NULL,
	"order_ref_system" varchar(100),
	"order_ref_number" varchar(100),
	"stage" varchar(40) NOT NULL,
	"state_payload" jsonb NOT NULL,
	"collection" jsonb NOT NULL,
	"drop_off" jsonb NOT NULL,
	"consignee" jsonb NOT NULL,
	"promised_window_start" timestamp with time zone NOT NULL,
	"promised_window_end" timestamp with time zone NOT NULL,
	"temperature_zone" varchar(20) NOT NULL,
	"handling" jsonb DEFAULT '[]' NOT NULL,
	"lines" jsonb DEFAULT '[]' NOT NULL,
	"parcels" jsonb DEFAULT '[]' NOT NULL,
	"linked_shipments" jsonb DEFAULT '[]' NOT NULL,
	"reaction" jsonb NOT NULL,
	"planned_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"terminated_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" varchar(13) PRIMARY KEY,
	"message" varchar(1000) NOT NULL,
	"level" varchar(10) NOT NULL,
	"code" varchar(200) NOT NULL,
	"aggregate_type" varchar(100),
	"aggregate_id" varchar(100),
	"metadata" jsonb,
	"correlation_id" varchar(100) NOT NULL,
	"principal_id" varchar(100) NOT NULL,
	"tenant_id" varchar(100),
	"emit_event" boolean DEFAULT false NOT NULL,
	"captured_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_samples" (
	"id" varchar(13) PRIMARY KEY,
	"route" varchar(500) NOT NULL,
	"duration_ms" integer NOT NULL,
	"threshold_ms" integer NOT NULL,
	"excess_ms" integer NOT NULL,
	"queries" jsonb NOT NULL,
	"correlation_id" varchar(100) NOT NULL,
	"tenant_id" varchar(100),
	"captured_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lmf_tenant_source_lookup_idx" ON "last_mile_fulfilments" ("tenant_id","source_note_system","source_note_type","source_note_number");--> statement-breakpoint
CREATE UNIQUE INDEX "lmf_unique_open_source" ON "last_mile_fulfilments" ("tenant_id","source_note_system","source_note_type","source_note_number") WHERE "terminated_at" is null;--> statement-breakpoint
CREATE INDEX "lmf_stage_idx" ON "last_mile_fulfilments" ("tenant_id","stage");--> statement-breakpoint
CREATE INDEX "lmf_promised_window_idx" ON "last_mile_fulfilments" ("tenant_id","promised_window_end");--> statement-breakpoint
CREATE INDEX "lmf_metadata_idx" ON "last_mile_fulfilments" USING gin ("metadata");