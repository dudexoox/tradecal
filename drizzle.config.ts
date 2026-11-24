import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// Prefer the app's local env file, then a plain .env, then the shell environment.
dotenv.config({ path: ".env.local" });
dotenv.config();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
