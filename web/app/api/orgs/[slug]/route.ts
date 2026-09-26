import type { NextRequest } from "next/server";
import { jsonHandler } from "@/lib/api";
import { getOrgProfile } from "@/lib/publicQueries";
import { BadRequest, parseAsOf } from "@/lib/queries";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/orgs/[slug]">) {
  const { slug } = await ctx.params;
  return jsonHandler(async () => {
    const profile = await getOrgProfile(slug, parseAsOf(req.nextUrl.searchParams.get("as_of")));
    if (!profile) throw new BadRequest(`organization "${slug}" not found`);
    return profile;
  });
}
