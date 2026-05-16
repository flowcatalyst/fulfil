CREATE TABLE "last_mile_shipments" (
	"id" varchar(17) PRIMARY KEY,
	"tenant_id" varchar(100) NOT NULL,
	"fulfilment_id" varchar(17) NOT NULL,
	"collection" jsonb NOT NULL,
	"drop_off" jsonb NOT NULL,
	"consignee" jsonb NOT NULL,
	"promised_window_start" timestamp with time zone NOT NULL,
	"promised_window_end" timestamp with time zone NOT NULL,
	"temperature_zone" varchar(20) NOT NULL,
	"handling" jsonb DEFAULT '[]' NOT NULL,
	"lines" jsonb DEFAULT '[]' NOT NULL,
	"parcels" jsonb DEFAULT '[]' NOT NULL,
	"trip_id" varchar(17),
	"status" varchar(30) NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lms_fulfilment_idx" ON "last_mile_shipments" ("tenant_id","fulfilment_id");--> statement-breakpoint
CREATE INDEX "lms_status_idx" ON "last_mile_shipments" ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "lms_trip_idx" ON "last_mile_shipments" ("tenant_id","trip_id");--> statement-breakpoint
CREATE INDEX "lms_promised_window_idx" ON "last_mile_shipments" ("tenant_id","promised_window_end");--> statement-breakpoint
CREATE INDEX "lms_metadata_idx" ON "last_mile_shipments" USING gin ("metadata");