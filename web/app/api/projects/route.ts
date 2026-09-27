import type { NextRequest } from "next/server";
import { boolParam, jsonHandler, numParam } from "@/lib/api";
import { BadRequest, getProjects, parseAsOf } from "@/lib/queries";

export async function GET(req: NextRequest) {
  return jsonHandler(async () => {
    const sp = req.nextUrl.searchParams;
    const as_of = parseAsOf(sp.get("as_of"));
    const idsRaw = sp.get("ids");
    const ids = idsRaw
      ? idsRaw.split(",").filter(Boolean).map((s) => {
          const n = Number(s);
          if (!Number.isInteger(n)) throw new BadRequest("ids must be comma-separated integers");
          return n;
        })
      : null;
    const projects = await getProjects(as_of, {
      parent: sp.get("parent"),
      state: sp.get("state"),
      county: sp.get("county"),
      min_prob: numParam(sp, "min_prob"),
      max_prob: numParam(sp, "max_prob"),
      min_cost: numParam(sp, "min_cost"),
      has_permit: boolParam(sp, "has_permit"),
      ids,
    });
    return { as_of, projects };
  });
}
