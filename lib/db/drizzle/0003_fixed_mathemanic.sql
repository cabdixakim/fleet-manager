ALTER TABLE "clients" ADD COLUMN "opening_balance" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "opening_balance" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "subcontractors" ADD COLUMN "opening_balance" numeric(14, 2) DEFAULT '0' NOT NULL;