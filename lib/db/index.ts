/**
 * Drizzle client — server-only, lazy singleton.
 *
 * Connection uses the `postgres` driver against Supabase's transaction
 * pooler (port 6543). `prepare: false` is required for that pooler.
 *
 * Why lazy: `next build` collects page data with NODE_ENV=production but
 * without .env loaded. If we threw at module load on a missing
 * DATABASE_URL, the build would fail before any request was made.
 */
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as relations from "./relations";
import * as schema from "./schema";

function makeDb(client: postgres.Sql) {
  return drizzle(client, {
    schema: { ...schema, ...relations },
    logger: process.env.NODE_ENV !== "production",
  });
}
type DrizzleClient = ReturnType<typeof makeDb>;

// Cache the client + db on globalThis so dev HMR doesn't leak connections.
const globalForDb = globalThis as unknown as {
  __postgresClient?: postgres.Sql;
  __db?: DrizzleClient;
};

function getDb(): DrizzleClient {
  if (globalForDb.__db) return globalForDb.__db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
  }
  const client =
    globalForDb.__postgresClient ??
    postgres(connectionString, { prepare: false, max: 10 });
  globalForDb.__postgresClient = client;
  globalForDb.__db = makeDb(client);
  return globalForDb.__db;
}

export const db: DrizzleClient = new Proxy({} as DrizzleClient, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type DB = DrizzleClient;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
