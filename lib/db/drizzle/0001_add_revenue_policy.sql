-- Add revenue_attribution_policy column to company_settings
ALTER TABLE "company_settings" ADD COLUMN "revenue_attribution_policy" text DEFAULT 'ORIGINAL' NOT NULL;
