CREATE TABLE "periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL
);
