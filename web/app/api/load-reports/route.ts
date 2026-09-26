import type { NextRequest } from "next/server";
import { jsonHandler } from "@/lib/api";
import { getLoadReports, parseAsOf } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("region");
  const region = raw && /^[A-Z0-9-]{1,24}$/.test(raw) ? raw : null;
  return jsonHandler(async () => getLoadReports(parseAsOf(req.nextUrl.searchParams.get("as_of")), region));
}
