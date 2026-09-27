"use client";
import { useState } from "react";
import QueueTimeline from "@/components/QueueTimeline";
import RegionReports, { RegionSelect, regionLabel } from "@/components/RegionReports";
import { useJson } from "@/lib/useJson";
import type { LoadReports, QueueTimeline as QueueTimelineData } from "@/lib/types";

/** Queue Timeline tab: ERCOT's history with a clickable week cursor, or another region's load report. */
export default function QueueTimelineView({ data, today }: { data: QueueTimelineData; today: string }) {
  const [asOf, setAsOf] = useState(today);
  const [region, setRegion] = useState("ERCO");
  const reports = useJson<LoadReports>(`/api/load-reports?region=${region}&as_of=${today}`);
  const picked = reports.data?.regions.find((r) => r.region_key === region);
  const label = picked ? regionLabel(picked) : "this region";
  return (
    <>
      <p className="ub-eyebrow">Queue Timeline</p>
      {region === "ERCO" ? (
        <>
          <h1 className="rw-display-sm mt-3">How much of the Texas grid queue is real?</h1>
          <p className="rw-subtitle mt-5 max-w-3xl">
            ERCOT publishes how much power large users have asked for. We compare it, week by week, with what has been approved, what is
            actually running, and what shows up in public construction records, then show what that means for when a new project could
            connect. Pick another region below to see its published load report.
          </p>
        </>
      ) : (
        <>
          <h1 className="rw-display-sm mt-3">How much new load is {label} reporting?</h1>
          <p className="rw-subtitle mt-5 max-w-3xl">
            These are {label}&apos;s own load figures, shown as published with the scope each one covers. There is no weekly queue here to
            check against approvals and construction records, so we don&apos;t estimate how much of it is real. That comparison is
            ERCOT-only.
          </p>
        </>
      )}
      <div className="mt-10 flex flex-col gap-4">
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
    </>
  );
}
