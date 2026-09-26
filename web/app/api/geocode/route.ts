import type { NextRequest } from "next/server";
import { jsonHandler } from "@/lib/api";
import { geocode } from "@/lib/geocode";

export async function GET(req: NextRequest) {
  return jsonHandler(() => geocode(req.nextUrl.searchParams.get("q") ?? ""));
}
