import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Drizzle Kit doesn't auto-load Next.js's `.env.local` (the gitignored local
// secrets file). Load it explicitly, then fall through to `.env` for CI.
config({ path: ".env.local" });
config({ path: ".env" });

// Schema lives in lib/db/schema.ts (the single source of truth for data shape).
// Generated SQL migrations land in ./drizzle.
//
// Drizzle Kit (push / migrate) needs session-level features (advisory locks,
// transactional DDL) that Supabase's *transaction* pooler on port 6543 can't
// provide. So migrations use DIRECT_DATABASE_URL (port 5432, session pooler);
// the app runtime in lib/db/index.ts continues to use DATABASE_URL (6543).
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
