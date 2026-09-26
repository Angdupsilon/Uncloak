"use client";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { fmtDate, fmtGW, fmtMonth, isLink } from "@/lib/format";
import type { Summary } from "@/lib/types";

function Source({ url, label }: { url: string | null | undefined; label: string }) {
  if (isLink(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-black">
        {label}
      </a>
    );
  }
  return <span>{url || label}</span>;
}

function Card({
  title,
  value,
  sub,
  foot,
  children,
  accent,
}: {
  title: string;
  value: string;
  sub?: React.ReactNode;
  foot: React.ReactNode;
  children?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="ub-card flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-hidden px-4 py-3 transition-shadow hover:shadow-[var(--shadow-float)]">
      <div className="ub-body-md-strong text-[#5e5e5e]">{title}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className={`ub-display-xl tabular-nums ${accent ?? "text-black"}`}>{value}</div>
        {children}
      </div>
      {sub && <div className="ub-body-sm mt-1.5 truncate text-[#5e5e5e]">{sub}</div>}
      <div className="ub-caption mt-1 truncate text-[#afafaf]">{foot}</div>
    </div>
  );
}

export default function SummaryBar({ summary, loading, error }: { summary: Summary | null; loading: boolean; error: string | null }) {
  if (error && !summary) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-[#5e5e5e]">Summary unavailable: {error}</div>;
  }
  if (!summary) {
    return (
      <div className="flex h-full flex-col gap-3">
        {["ERCOT queue", "Found on map", "Evidence-weighted", "Shadow load"].map((t) => (
          <div key={t} className="min-h-0 flex-1 animate-pulse rounded-2xl bg-[#efefef]" />
        ))}
      </div>
    );
  }

  const s = summary;
  const noMw = s.projects > 0 && s.projects_with_mw === 0;
  // Older cached/deployed API responses may predate the weekly series. Keep a
  // version-skewed response from crashing the whole dashboard during replay.
  const spark = (Array.isArray(s.weekly) ? s.weekly : []).map((w) => ({
    t: Date.parse(w.week),
    realistic: w.realistic_gw,
    found: w.found_gw,
  }));

  return (
    <div className={`flex h-full flex-col gap-3 transition-opacity duration-200 ${loading ? "opacity-60" : ""}`}>
      <Card
        title="ERCOT large-load queue"
        value={s.ercot ? fmtGW(s.ercot.gw_requested) : "No data"}
        sub={
          s.ercot ? (
            <>
              Approved {fmtGW(s.ercot.gw_approved)}
              {s.ercot.approved_ts && s.ercot.approved_ts !== s.ercot.ts ? ` (${fmtDate(s.ercot.approved_ts)})` : ""} · Observed{" "}
              {fmtGW(s.ercot.gw_observed_peak)}
              {s.ercot.peak_ts && s.ercot.peak_ts !== s.ercot.ts ? ` (${fmtDate(s.ercot.peak_ts)})` : ""}
            </>
          ) : (
            "No ERCOT queue data on or before this date"
          )
        }
        foot={
          s.ercot ? (
            <>
              As of {fmtDate(s.ercot.ts)} · <Source url={s.ercot.source_url} label="source" />
            </>
          ) : (
            "ERCOT"
          )
        }
      />
      <Card
        title="Found on map"
        value={fmtGW(s.found_gw, 2)}
        sub={
          noMw
            ? "MW estimate unavailable: MW_COST_PER_MW_USD not set"
            : `${s.projects} projects with evidence · ${s.projects_with_mw} with cost data`
        }
        foot={<>As of {fmtDate(s.as_of)} · TDLR, Comptroller, TCEQ public records</>}
      />
      <Card
        title="Evidence-weighted demand"
        value={fmtGW(s.realistic_gw, 2)}
        sub="Σ evidence score × estimated MW"
        foot={<>As of {fmtDate(s.as_of)} · Evidence index (uncalibrated)</>}
      >
        {spark.length > 1 && !noMw && (
          <div className="h-9 w-20 shrink-0" aria-label="Weekly evidence-weighted vs found GW">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
                <Tooltip
                  labelFormatter={(v) => fmtMonth(Number(v))}
                  formatter={(v, name) => [fmtGW(Number(v), 2), name === "found" ? "Found" : "Weighted"]}
                  contentStyle={{ fontSize: 11 }}
                />
                <Area dataKey="found" type="stepAfter" stroke="#94a3b8" fill="#e2e8f0" isAnimationActive={false} />
                <Area dataKey="realistic" type="stepAfter" stroke="#047857" fill="#a7f3d0" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <Card
        title="Shadow load"
        value={fmtGW(s.shadow_gw)}
        sub="ERCOT requested − found on map"
        foot={
          s.ercot ? (
            <>
              ERCOT {fmtDate(s.ercot.ts)} vs. map {fmtDate(s.as_of)}
            </>
          ) : (
            "Needs ERCOT queue data"
          )
        }
      />
    </div>
  );
}
