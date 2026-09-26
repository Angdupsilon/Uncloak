import type { NextRequest } from "next/server";
import { jsonHandler } from "@/lib/api";
import { BadRequest, getTimeline, parseAsOf } from "@/lib/queries";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) return Response.json({ error: "id must be an integer" }, { status: 400 });
  return jsonHandler(async () => {
    const timeline = await getTimeline(projectId, parseAsOf(req.nextUrl.searchParams.get("as_of")));
    if (!timeline) throw new BadRequest(`project ${projectId} not found`);
    return timeline;
  });
}
