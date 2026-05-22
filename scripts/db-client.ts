/**
 * Drizzle client for CLI scripts — a standalone version of `lib/db/index.ts`
 * without the `server-only` guard (which is bundler magic, not runtime).
 *
 * Why a separate client:
 *   - CLI tools want explicit lifecycle (open → run → close), not the
 *     long-lived singleton the Next.js runtime uses.
 *   - Importing `lib/db` would pull in `server-only`, which is a Next-only
 *     package that throws when imported outside the Next bundler.
 *
 * Connection target: prefers DIRECT_DATABASE_URL (session pooler, port 5432)
 * to match drizzle-kit migrate semantics, falling back to DATABASE_URL. DDL
 * statements like TRUNCATE work over either pooler in Postgres 15+, but the
 * session pooler is the safer default for admin work.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as relations from "@/lib/db/relations";
import * as schema from "@/lib/db/schema";

export function makeCliDb() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL (or DIRECT_DATABASE_URL) is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema: { ...schema, ...relations } });
  return { db, close: () => client.end({ timeout: 5 }) };
}

export type CliDb = ReturnType<typeof makeCliDb>["db"];
