import type { NextRequest } from "next/server";
import { jsonHandler } from "@/lib/api";
import { search } from "@/lib/publicQueries";

export async function GET(req: NextRequest) {
  return jsonHandler(async () => {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    return { q, hits: await search(q) };
  });
}
