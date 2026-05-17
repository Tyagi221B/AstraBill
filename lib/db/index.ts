/**
 * Drizzle client — server-only.
 *
 * Imports are wired so that `db.query.X.findMany({ with: { ... } })` works:
 * the schema's tables AND the relations both have to be passed in.
 *
 * Connection uses the `postgres` driver against Supabase's connection pooler
 * (port 6543). `prepare: false` is required for the transaction pooler.
 */
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import * as relations from "./relations";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

// Module-singleton pattern: in dev, hot reload re-imports the file — without
// the global cache we'd leak connections on every refresh.
const globalForDb = globalThis as unknown as {
  __postgresClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__postgresClient ??
  postgres(connectionString, {
    prepare: false, // Required when going through Supabase's transaction pooler.
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__postgresClient = client;
}

export const db = drizzle(client, {
  schema: { ...schema, ...relations },
  logger: process.env.NODE_ENV !== "production",
});

export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
