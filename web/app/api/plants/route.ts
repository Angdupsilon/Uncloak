import { jsonHandler } from "@/lib/api";
import { getPlants } from "@/lib/queries";

export async function GET() {
  return jsonHandler(async () => ({ plants: await getPlants() }));
}
