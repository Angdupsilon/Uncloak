import type { NextRequest } from "next/server";
import { jsonHandler } from "@/lib/api";
import { BadRequest, PLANT_ID_RE, getPlantDetail } from "@/lib/queries";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!PLANT_ID_RE.test(id)) return Response.json({ error: "invalid plant id" }, { status: 400 });
  return jsonHandler(async () => {
    const detail = await getPlantDetail(id);
    if (!detail) throw new BadRequest(`plant ${id} not found`);
    return detail;
  });
}
