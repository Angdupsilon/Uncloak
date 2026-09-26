import { BadRequest } from "./queries";

/** Wrap a route handler body: JSON response, 400 on bad input, 500 on anything else. */
export async function jsonHandler(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (err) {
    if (err instanceof BadRequest) return Response.json({ error: err.message }, { status: 400 });
    console.error("[gridsight api]", err);
    return Response.json({ error: "Database query failed" }, { status: 500 });
  }
}

export function numParam(sp: URLSearchParams, key: string): number | null {
  const v = sp.get(key);
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new BadRequest(`${key} must be a number`);
  return n;
}

export function boolParam(sp: URLSearchParams, key: string): boolean | null {
  const v = sp.get(key);
  if (v == null || v === "") return null;
  if (["true", "1", "yes"].includes(v.toLowerCase())) return true;
  if (["false", "0", "no"].includes(v.toLowerCase())) return false;
  throw new BadRequest(`${key} must be true or false`);
}
