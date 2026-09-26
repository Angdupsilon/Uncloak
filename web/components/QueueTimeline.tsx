"use client";
import { useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtDate, fmtGW, fmtMonth } from "@/lib/format";
import type { QueueTimeline as QueueTimelineData, QueueWeek } from "@/lib/types";

const COLORS = {
  requested: "#be123c", // ERCOT queue
  approved: "#9f1239",
  band: "#fecdd3", // shadow load band
  found: "#64748b",
  weighted: "#047857",
};

type Row = {
  t: number;
  requested: number | null;
  approved: number | null;
  found: number | null;
  weighted: number | null;
  band: [number, number] | null;
  /** Set on the first week a new ERCOT report applies, so the report shows as a dot. */
  report: number | null;
  w: QueueWeek;
};

const day = (iso: string) => iso.slice(0, 10);
const pos = (v: number | null, log: boolean) => (v == null ? null : log && v <= 0 ? null : v);

function signed(v: number | null) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : "−"}${fmtGW(Math.abs(v), 2)}`;
}

export default function QueueTimeline({
  data,
  error,
  asOf,
  onPick,
}: {
  data: QueueTimelineData | null;
  error: string | null;
  asOf: string;
  onPick: (asOf: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [log, setLog] = useState(false);

  const rows: Row[] = useMemo(
    () =>
      (data?.weeks ?? []).map((w, i, all) => {
        const requested = pos(w.gw_requested, log);
        const found = pos(w.found_gw, log);
        const newReport = w.ercot_ts != null && w.ercot_ts !== all[i - 1]?.ercot_ts;
        return {
          t: Date.parse(w.week),
          requested,
          approved: pos(w.gw_approved, log),
          found,
          weighted: pos(w.realistic_gw, log),
          band: requested != null && found != null ? [found, requested] : null,
          report: newReport ? requested : null,
          w,
        };
      }),
    [data, log],
  );
  const cursor = Date.parse(`${asOf}T00:00:00Z`);
  const current = [...rows].reverse().find((r) => r.t <= cursor)?.w ?? null;
  const noErcot = rows.length > 0 && rows.every((r) => r.requested == null);

  return (
    <section className="ub-card shrink-0 overflow-hidden px-4 py-3">
      <div className="flex items-center gap-4">
        <button onClick={() => setOpen((o) => !o)} className="ub-body-md-strong flex items-center gap-2 text-black" aria-expanded={open}>
          <span aria-hidden className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          Queue timeline
        </button>
        {current && (
          <div className="ub-body-sm flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-[#5e5e5e]">
            <span>Week of {fmtDate(day(current.week))}</span>
            <span style={{ color: COLORS.requested }}>ERCOT queue {fmtGW(current.gw_requested)}</span>
            <span>Found {fmtGW(current.found_gw, 2)}</span>
            <span style={{ color: COLORS.weighted }}>Evidence-weighted {fmtGW(current.realistic_gw, 2)}</span>
            <span>{signed(current.realistic_gw_delta)} this week</span>
            <span>
              {current.projects_up} project{current.projects_up === 1 ? "" : "s"} up · {current.projects_new} new
            </span>
          </div>
        )}
        {!current && <div className="ub-body-sm flex-1 text-[#afafaf]">{error ? `Unavailable: ${error}` : data ? "No scored weeks yet" : "Loading…"}</div>}
        <label className="ub-caption flex shrink-0 items-center gap-1.5 text-[#5e5e5e]">
          <input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} />
          Log scale
        </label>
      </div>

      {open && (
        <div className="mt-2 h-[170px]">
          {noErcot && (
            <div className="ub-caption mb-1 text-amber-700">No ERCOT queue reports loaded yet: add rows to ercot_queue.csv to draw the queue line.</div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={rows}
              margin={{ top: 6, right: 12, bottom: 0, left: 0 }}
              onClick={(e) => {
                const t = Number(e?.activeLabel);
                if (Number.isFinite(t)) onPick(new Date(t).toISOString().slice(0, 10));
              }}
              style={{ cursor: "pointer" }}
            >
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtMonth(Number(v))} tick={{ fontSize: 11 }} />
              <YAxis
                scale={log ? "log" : "linear"}
                domain={log ? [0.01, "auto"] : [0, "auto"]}
                allowDataOverflow={log}
                tickFormatter={(v) => `${Number(v).toLocaleString()} GW`}
                tick={{ fontSize: 11 }}
                width={64}
              />
              <Tooltip
                labelFormatter={(v) => `Week of ${fmtDate(new Date(Number(v)).toISOString())}`}
                formatter={(v, name, item) => {
                  if (name === "Shadow load" && Array.isArray(v)) return [fmtGW(Number(v[1]) - Number(v[0])), name];
                  if (name === "New ERCOT report") {
                    const ts = (item?.payload as Row | undefined)?.w.ercot_ts;
                    return [ts ? `dated ${fmtDate(ts)}` : "", name];
                  }
                  return [fmtGW(Number(v), 2), name];
                }}
                contentStyle={{ fontSize: 11 }}
              />
              <Area dataKey="band" name="Shadow load" type="stepAfter" stroke="none" fill={COLORS.band} fillOpacity={0.6} isAnimationActive={false} connectNulls={false} />
              <Line dataKey="requested" name="ERCOT queue (requested)" type="stepAfter" stroke={COLORS.requested} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="approved" name="ERCOT approved to energize" type="stepAfter" stroke={COLORS.approved} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              <Line dataKey="found" name="Found in public records" type="stepAfter" stroke={COLORS.found} dot={false} isAnimationActive={false} />
              <Line dataKey="weighted" name="Evidence-weighted" type="stepAfter" stroke={COLORS.weighted} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="report" name="New ERCOT report" stroke="none" dot={{ r: 3.5, fill: COLORS.requested, stroke: "#fff" }} activeDot={false} connectNulls={false} isAnimationActive={false} legendType="none" />
              <ReferenceLine x={cursor} stroke="#0f172a" strokeDasharray="2 2" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
