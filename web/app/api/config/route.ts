import type { NextRequest } from "next/server";
import { jsonHandler } from "@/lib/api";
import { getConfig, parseAsOf } from "@/lib/queries";

export async function GET(req: NextRequest) {
  return jsonHandler(async () => getConfig(parseAsOf(req.nextUrl.searchParams.get("as_of"))));
}
