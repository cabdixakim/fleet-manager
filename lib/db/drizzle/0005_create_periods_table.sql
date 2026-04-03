-- Migration for periods table
CREATE TABLE IF NOT EXISTS "periods" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "is_closed" boolean NOT NULL DEFAULT false
);
