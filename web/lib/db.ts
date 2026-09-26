import { Pool, types } from "pg";

// Return numeric/bigint as JS numbers (counts and sums here are well within range).
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)));

const globalForPool = globalThis as unknown as { gridsightPool?: Pool };

function makePool(): Pool {
  const url = process.env.DATABASE_URL_RO ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_RO is not set (see .env.example)");
  if (!process.env.DATABASE_URL_RO) {
    console.warn("[gridsight] DATABASE_URL_RO not set; falling back to DATABASE_URL. Use the read-only role in production.");
  }
  // Timestamps come back as JS Dates (absolute instants), and every date cutoff in
  // queries.ts is converted with AT TIME ZONE 'UTC', so the session time zone never matters.
  return new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
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
