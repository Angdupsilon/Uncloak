import { connection } from "next/server";
import Dashboard from "@/components/Dashboard";
import { todayUtc } from "@/lib/queries";

// Rendered per request so "today" (the default as-of date) is never baked in at build time.
export default async function Page() {
  await connection();
  return <Dashboard today={todayUtc()} />;
}
