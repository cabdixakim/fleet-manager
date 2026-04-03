CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"address" text,
	"ago_short_charge_rate" numeric(10, 4) DEFAULT '0' NOT NULL,
	"pms_short_charge_rate" numeric(10, 4) DEFAULT '0' NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontractors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"address" text,
	"commission_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trucks" (
	"id" serial PRIMARY KEY NOT NULL,
	"plate_number" text NOT NULL,
	"trailer_plate" text,
	"subcontractor_id" integer NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trucks_plate_number_unique" UNIQUE("plate_number")
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"passport_number" text,
	"license_number" text,
	"phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"status_effective_date" timestamp,
	"monthly_salary" numeric(10, 2) DEFAULT '0' NOT NULL,
	"assigned_truck_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"client_id" integer NOT NULL,
	"route" text NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"rate_per_mt" numeric(10, 4) NOT NULL,
	"nominated_date" timestamp,
	"loaded_date" timestamp,
	"delivered_date" timestamp,
	"cancellation_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"truck_id" integer NOT NULL,
	"driver_id" integer,
	"product" text NOT NULL,
	"capacity" numeric(10, 3) NOT NULL,
	"status" text DEFAULT 'nominated' NOT NULL,
	"loaded_qty" numeric(10, 3),
	"delivered_qty" numeric(10, 3),
	"mileage_start" numeric(10, 2),
	"mileage_end" numeric(10, 2),
	"fuel1" numeric(10, 2),
	"fuel2" numeric(10, 2),
	"fuel3" numeric(10, 2),
	"cancellation_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_amendments" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"amendment_type" text NOT NULL,
	"old_truck_id" integer,
	"new_truck_id" integer,
	"old_driver_id" integer,
	"new_driver_id" integer,
	"reason" text NOT NULL,
	"amended_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer,
	"batch_id" integer,
	"truck_id" integer,
	"subcontractor_id" integer,
	"tier" text DEFAULT 'trip' NOT NULL,
	"cost_type" text NOT NULL,
	"description" text,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"expense_date" timestamp DEFAULT now() NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clearances" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"checkpoint" text NOT NULL,
	"document_type" text NOT NULL,
	"document_number" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_at" timestamp,
	"approved_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"content" text NOT NULL,
	"attachment_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_payroll_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"payroll_id" integer NOT NULL,
	"trip_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_payroll" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" integer NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"monthly_salary" numeric(10, 2) NOT NULL,
	"trips_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reference" text,
	"batch_id" integer,
	"description" text,
	"transaction_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcontractor_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"subcontractor_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"trip_id" integer,
	"driver_id" integer,
	"description" text,
	"transaction_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"expense_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"batch_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"total_loaded_qty" numeric(10, 3) DEFAULT '0' NOT NULL,
	"total_delivered_qty" numeric(10, 3) DEFAULT '0' NOT NULL,
	"rate_per_mt" numeric(10, 4) NOT NULL,
	"gross_revenue" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total_short_charge" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_revenue" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"issued_date" timestamp,
	"due_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text DEFAULT 'My Transport Company' NOT NULL,
	"logo_url" text,
	"address" text,
	"email" text,
	"phone" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"tax_id" text,
	"website" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"recovery_code_hash" text,
	"owner_email" text,
	"revenue_attribution_policy" text DEFAULT 'ORIGINAL' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'operations' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"user_name" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"description" text NOT NULL,
	"metadata" jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_assigned_truck_id_trucks_id_fk" FOREIGN KEY ("assigned_truck_id") REFERENCES "public"."trucks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_amendments" ADD CONSTRAINT "trip_amendments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearances" ADD CONSTRAINT "clearances_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_payroll_allocations" ADD CONSTRAINT "driver_payroll_allocations_payroll_id_driver_payroll_id_fk" FOREIGN KEY ("payroll_id") REFERENCES "public"."driver_payroll"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_payroll" ADD CONSTRAINT "driver_payroll_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_transactions" ADD CONSTRAINT "client_transactions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_transactions" ADD CONSTRAINT "client_transactions_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractor_transactions" ADD CONSTRAINT "subcontractor_transactions_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractor_transactions" ADD CONSTRAINT "subcontractor_transactions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractor_transactions" ADD CONSTRAINT "subcontractor_transactions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;