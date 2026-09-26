import { connection } from "next/server";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import QueueTimelineView from "@/components/public/QueueTimelineView";
import { Container, ErrorState } from "@/components/public/ui";
import { getQueueTimeline, todayUtc } from "@/lib/queries";

export const metadata: Metadata = { title: "Queue Timeline · Uncloak" };

async function load(asOf: string) {
  try {
    return { ok: true as const, data: await getQueueTimeline(asOf) };
  } catch (err) {
    console.error("[gridsight queue timeline]", err);
    return { ok: false as const };
  }
}

export default async function QueueTimelinePage() {
  await connection();
  const today = todayUtc();
  const res = await load(today);
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Container className="py-12">
          <p className="ub-eyebrow">Queue Timeline</p>
          <h1 className="rw-display-sm mt-3">How much of the Texas grid queue is real?</h1>
          <p className="rw-subtitle mt-5 max-w-3xl">
            ERCOT publishes how much power large users have asked for. We compare it, week by week, with what has been approved, what is actually
            running, and what shows up in public construction records, then show what that means for when a new project could connect. Other
            regions&apos; load reports (Georgia Power, PJM zones) are available from the picker and shown as published, each with its scope.
          </p>
          <div className="mt-10">{res.ok ? <QueueTimelineView data={res.data} today={today} /> : <ErrorState />}</div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
