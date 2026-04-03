ALTER TABLE "drivers" DROP CONSTRAINT "drivers_assigned_truck_id_trucks_id_fk";
--> statement-breakpoint
ALTER TABLE "drivers" DROP COLUMN "assigned_truck_id";