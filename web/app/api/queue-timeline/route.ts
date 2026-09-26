import type { NextRequest } from "next/server";
import { jsonHandler } from "@/lib/api";
import { getQueueTimeline, parseAsOf } from "@/lib/queries";

export async function GET(req: NextRequest) {
  return jsonHandler(async () => getQueueTimeline(parseAsOf(req.nextUrl.searchParams.get("as_of"))));
}
