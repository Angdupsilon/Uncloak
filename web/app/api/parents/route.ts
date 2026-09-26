import type { NextRequest } from "next/server";
import { jsonHandler } from "@/lib/api";
import { getParents, parseAsOf } from "@/lib/queries";

export async function GET(req: NextRequest) {
  return jsonHandler(async () => {
    const as_of = parseAsOf(req.nextUrl.searchParams.get("as_of"));
    return { as_of, parents: await getParents(as_of) };
  });
}
