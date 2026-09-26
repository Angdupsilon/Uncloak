import type { NextRequest } from "next/server";
import { jsonHandler, numParam } from "@/lib/api";
import { geocode } from "@/lib/geocode";
import { DEFAULT_RADIUS_MI } from "@/lib/geo";
import { getNearby } from "@/lib/publicQueries";
import { BadRequest, parseAsOf } from "@/lib/queries";

/** GET /api/near?q=Abilene or ?lat=&lon=, optional radius_mi (1–200) and county. */
export async function GET(req: NextRequest) {
  return jsonHandler(async () => {
    const sp = req.nextUrl.searchParams;
    const asOf = parseAsOf(sp.get("as_of"));
    const radius = numParam(sp, "radius_mi") ?? DEFAULT_RADIUS_MI;
    if (radius < 1 || radius > 200) throw new BadRequest("radius_mi must be between 1 and 200");
    const lat = numParam(sp, "lat");
    const lon = numParam(sp, "lon");
    const where = await geocode(lat != null && lon != null ? `${lat},${lon}` : (sp.get("q") ?? ""));
    if (!where.ok) return { located: where };
    const county = sp.get("county") ?? where.county;
    return { located: where, ...(await getNearby({ lat: where.lat, lon: where.lon, label: where.label }, radius, asOf, county)) };
  });
}
