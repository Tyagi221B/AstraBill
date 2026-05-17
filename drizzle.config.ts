import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Schema lives in lib/db/schema.ts (the single source of truth for data shape).
// Generated SQL migrations land in ./drizzle.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
