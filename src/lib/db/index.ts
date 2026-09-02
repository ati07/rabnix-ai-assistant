import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Single shared postgres.js connection + Drizzle client.
 *
 * Cached on `globalThis` so Next.js hot-reload / serverless invocations reuse
 * one pool instead of exhausting Postgres connections. `prepare: false` keeps
 * us compatible with Supabase's transaction pooler.
 */

const globalForDb = globalThis as unknown as {
  __rabnixSql?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__rabnixSql ??
  postgres(env.DATABASE_URL, { max: 10, prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__rabnixSql = client;
}

export const db = drizzle(client, { schema });
export { schema };
export type Database = typeof db;
