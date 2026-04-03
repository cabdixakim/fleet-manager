import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

console.log("Drizzle connecting to:", process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  tablesFilter: ["!session"],
});
