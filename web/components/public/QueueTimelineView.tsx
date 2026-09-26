"use client";
import { useState } from "react";
import QueueTimeline from "@/components/QueueTimeline";
import RegionReports, { RegionSelect } from "@/components/RegionReports";
import { useJson } from "@/lib/useJson";
import type { LoadReports, QueueTimeline as QueueTimelineData } from "@/lib/types";

/** Queue Timeline tab: ERCOT's history with a clickable week cursor, or another region's load report. */
export default function QueueTimelineView({ data, today }: { data: QueueTimelineData; today: string }) {
  const [asOf, setAsOf] = useState(today);
  const [region, setRegion] = useState("ERCO");
  const reports = useJson<LoadReports>(`/api/load-reports?region=${region}&as_of=${today}`);
  return (
    <div className="flex flex-col gap-4">
      <RegionSelect regions={reports.data?.regions ?? []} value={region} onChange={setRegion} className="max-w-md !text-[14px]" />
      {region === "ERCO" ? (
        <QueueTimeline variant="page" data={data} error={null} asOf={asOf} today={today} onPick={setAsOf} />
      ) : (
        <section className="ub-card px-6 py-5">
          {reports.data && reports.data.region === region ? (
            <RegionReports data={reports.data} />
          ) : (
            <p className="text-[14px] text-[#5e5e5e]">{reports.error ? `Load report unavailable: ${reports.error}` : "Loading…"}</p>
          )}
        </section>
      )}
    </div>
  );
}
