CREATE TABLE "truck_driver_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"truck_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"assigned_at" timestamp DEFAULT now(),
	"unassigned_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "truck_driver_assignments" ADD CONSTRAINT "truck_driver_assignments_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_driver_assignments" ADD CONSTRAINT "truck_driver_assignments_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" DROP COLUMN "revenue_attribution_policy";