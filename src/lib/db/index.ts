import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";
import * as schema from "@/lib/db/schema";

export type Database = NodePgDatabase<typeof schema>;

interface GlobalWithDb {
  webshopDb?: Database;
  /** Schema module identity; a hot reload of the schema must rebuild the client. */
  webshopDbSchema?: unknown;
}

const globalWithDb = globalThis as GlobalWithDb;

const POOL_MAX_CONNECTIONS = 10;
/** Reap idle clients quickly: serverless Postgres (e.g. Neon) closes idle sockets server-side. */
const POOL_IDLE_TIMEOUT_MS = 30_000;
/** Generous connect timeout: serverless Postgres cold starts can take 10s+ after scale-to-zero. */
const POOL_CONNECT_TIMEOUT_MS = 30_000;

function createDatabase(): Database {
  const pool = new Pool({
    connectionString: env().DATABASE_URL,
    max: POOL_MAX_CONNECTIONS,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: POOL_CONNECT_TIMEOUT_MS,
    keepAlive: true,
  });
  pool.on("error", (poolError) => {
    console.error("[db] idle client error", poolError.message);
  });
  return drizzle({ client: pool, schema, casing: "snake_case" });
}

/**
 * Singleton database handle; cached on globalThis so dev hot reload reuses the
 * pool. When the schema module itself is reloaded (schema edits during dev),
 * the client is rebuilt so relational queries see the current relations — the
 * superseded pool drains via its idle timeout.
 */
export function getDb(): Database {
  if (!globalWithDb.webshopDb || globalWithDb.webshopDbSchema !== schema) {
    globalWithDb.webshopDb = createDatabase();
    globalWithDb.webshopDbSchema = schema;
  }
  return globalWithDb.webshopDb;
}

export { schema };
