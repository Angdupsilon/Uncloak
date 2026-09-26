import type { NextRequest } from "next/server";
import { jsonHandler } from "@/lib/api";
import { getSummary, parseAsOf } from "@/lib/queries";

export async function GET(req: NextRequest) {
  return jsonHandler(async () => getSummary(parseAsOf(req.nextUrl.searchParams.get("as_of"))));
}
