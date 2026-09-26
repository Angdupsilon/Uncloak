import { connection } from "next/server";
import Dashboard from "@/components/Dashboard";
import { todayUtc } from "@/lib/queries";

// Rendered per request so "today" (the default as-of date) is never baked in at build time.
// ?parent=Google preselects an organization filter; ?site=12 opens that site's panel.
export default async function Page(props: PageProps<"/dashboard">) {
  await connection();
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const site = Number(one(sp.site));
  return <Dashboard today={todayUtc()} initialParent={one(sp.parent)} initialSiteId={Number.isInteger(site) && site > 0 ? site : null} />;
}
