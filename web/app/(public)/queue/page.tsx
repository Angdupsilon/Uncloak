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
          {res.ok ? (
            <QueueTimelineView data={res.data} today={today} />
          ) : (
            <>
              <p className="ub-eyebrow">Queue Timeline</p>
              <div className="mt-10">
                <ErrorState />
              </div>
            </>
          )}
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
