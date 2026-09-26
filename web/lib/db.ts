import { Pool, types, type PoolConfig } from "pg";
import { TIGER_CLOUD_CA } from "./tigerCa";

// Return numeric/bigint as JS numbers (counts and sums here are well within range).
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)));

const globalForPool = globalThis as unknown as { gridsightPool?: Pool };

/**
 * node-postgres treats sslmode=require as full verification, and Tiger Cloud's
 * certificates chain to Tiger's own CA. Strip sslmode from the URL and pass an explicit
 * TLS config that trusts that CA (verification and hostname checks stay on).
 */
function poolConfig(url: string): PoolConfig {
  const u = new URL(url);
  const sslmode = u.searchParams.get("sslmode");
  u.searchParams.delete("sslmode");
  const ssl =
    sslmode && sslmode !== "disable"
      ? { ca: process.env.DATABASE_CA_CERT || TIGER_CLOUD_CA, rejectUnauthorized: true }
      : undefined;
  return { connectionString: u.toString(), ssl, max: 5, idleTimeoutMillis: 10_000 };
}

function makePool(): Pool {
  const url = process.env.DATABASE_URL_RO ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_RO is not set (see .env.example)");
  if (!process.env.DATABASE_URL_RO) {
    console.warn("[gridsight] DATABASE_URL_RO not set; falling back to DATABASE_URL. Use the read-only role in production.");
  }
  // Timestamps come back as JS Dates (absolute instants), and every date cutoff in
  // queries.ts is converted with AT TIME ZONE 'UTC', so the session time zone never matters.
  return new Pool(poolConfig(url));
}

/** Shared pg Pool connected as the read-only role (gridsight_ro). */
export function getPool(): Pool {
  if (!globalForPool.gridsightPool) globalForPool.gridsightPool = makePool();
  return globalForPool.gridsightPool;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}
