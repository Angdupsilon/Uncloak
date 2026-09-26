"use client";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { fmtDate, fmtGW, fmtMonth, isLink } from "@/lib/format";
import type { Summary } from "@/lib/types";

/** Queue colours. Black is the only conversion colour in the design system, so
 *  "real" load is ink and phantom load is the empty canvas it sits on. */
const INK = {
  energized: "#000000",
  approved: "#8a8a8a",
  phantom: "#e6e6e6",
  found: "#34D399", // matches the map's tier palette: public-record evidence
  weighted: "#047857",
};

/** Waffle: 1,000 squares, so each square is 0.1% of the queue. */
const WAFFLE_COLS = 50;
const WAFFLE_ROWS = 20;
const WAFFLE_CELLS = WAFFLE_COLS * WAFFLE_ROWS;

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

function fmtShare(part: number, whole: number): string {
  const p = (part / whole) * 100;
  if (p >= 99.95) return "100%";
  if (p >= 0.1) return `${p.toFixed(1)}%`;
  return p > 0 ? "<0.1%" : "0%";
}

/** Cells for a value, never rounding a non-zero value down to nothing. */
function cellsFor(gw: number, requested: number): number {
  if (gw <= 0) return 0;
  return Math.max(1, Math.round((gw / requested) * WAFFLE_CELLS));
}

function Waffle({ requested, approved, energized }: { requested: number; approved: number; energized: number }) {
  const nApproved = Math.min(WAFFLE_CELLS, cellsFor(approved, requested));
  const nEnergized = Math.min(nApproved, cellsFor(energized, requested));
  const pitch = 6;
  return (
    <svg
      viewBox={`0 0 ${WAFFLE_COLS * pitch} ${WAFFLE_ROWS * pitch}`}
      className="block w-full"
      role="img"
      aria-label={`${WAFFLE_CELLS} squares for the queue: ${nEnergized} energized, ${nApproved - nEnergized} approved, ${WAFFLE_CELLS - nApproved} with no approval`}
    >
      {Array.from({ length: WAFFLE_CELLS }, (_, i) => {
        const fill = i < nEnergized ? INK.energized : i < nApproved ? INK.approved : INK.phantom;
        return <rect key={i} x={(i % WAFFLE_COLS) * pitch} y={Math.floor(i / WAFFLE_COLS) * pitch} width={pitch - 1} height={pitch - 1} rx={1} fill={fill} />;
      })}
    </svg>
  );
}

function Swatch({ color, hollow }: { color: string; hollow?: boolean }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
      style={hollow ? { background: color, boxShadow: "inset 0 0 0 1px #d4d4d4" } : { background: color }}
    />
  );
}

/** One row of the reconciliation: label, value, and a bar on a linear scale of the queue. */
function Row({ label, gw, of, color, digits = 1 }: { label: string; gw: number; of: number | null; color: string; digits?: number }) {
  // Without an ERCOT denominator there is no share to show, only the bar.
  const pct = of ? Math.min(100, (gw / of) * 100) : 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="ub-body-sm truncate text-[#5e5e5e]">{label}</span>
        <span className="ub-body-sm-strong shrink-0 tabular-nums">
          {fmtGW(gw, digits)} {of ? <span className="ub-caption font-normal text-[#afafaf]">{fmtShare(gw, of)}</span> : null}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#efefef]">
        {/* Minimum 2px so a real but tiny share is still visible as "something". */}
        <div className="h-full rounded-full" style={{ width: `max(2px, ${pct}%)`, background: color }} />
      </div>
    </div>
  );
}

export default function SummaryBar({ summary, loading, error }: { summary: Summary | null; loading: boolean; error: string | null }) {
  if (error && !summary) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-[#5e5e5e]">Summary unavailable: {error}</div>;
  }
  if (!summary) {
    return <div className="h-full animate-pulse rounded-2xl bg-[#efefef]" />;
  }

  const s = summary;
  const e = s.ercot;
  const requested = e?.gw_requested ?? null;
  const approved = e?.gw_approved ?? null;
  const energized = e?.gw_observed_peak ?? null;
  const hasQueue = requested != null && requested > 0 && approved != null;
  const noMw = s.projects > 0 && s.projects_with_mw === 0;
  // Older cached/deployed API responses may predate the weekly series. Keep a
  // version-skewed response from crashing the whole dashboard during replay.
  const spark = (Array.isArray(s.weekly) ? s.weekly : []).map((w) => ({
    t: Date.parse(w.week),
    realistic: w.realistic_gw,
    found: w.found_gw,
  }));

  return (
    <div
      className={`ub-card flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4 transition-opacity duration-200 ${loading ? "opacity-60" : ""}`}
    >
      {/* 1. The headline: how much requested load is still waiting on ERCOT. */}
      <section>
        <div className="ub-body-md-strong text-[#5e5e5e]">Still waiting for ERCOT approval</div>
        {hasQueue ? (
          <>
            <div className="ub-display-xl mt-1 tabular-nums">{fmtShare(requested - approved, requested)}</div>
            <p className="ub-body-sm text-[#5e5e5e]">
              <span className="font-medium text-black">{fmtGW(requested - approved)}</span> of {fmtGW(requested)} requested is not approved to turn on.
            </p>
          </>
        ) : (
          <p className="ub-body-sm mt-1 text-[#5e5e5e]">No ERCOT queue data on or before this date.</p>
        )}
      </section>

      {hasQueue && (
        <section>
          <Waffle requested={requested} approved={approved} energized={energized ?? 0} />
          <div className="mt-2 space-y-0.5 text-[12px] leading-4 text-[#5e5e5e]">
            {energized != null && (
              <div className="flex items-center gap-2">
                <Swatch color={INK.energized} /> Using power (highest observed) · {fmtGW(energized)}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Swatch color={INK.approved} /> Approved to turn on · {fmtGW(Math.max(0, approved - (energized ?? 0)))}
            </div>
            <div className="flex items-center gap-2">
              <Swatch color={INK.phantom} hollow /> Waiting for ERCOT approval · {fmtGW(requested - approved)}
            </div>
          </div>
          <div className="mt-0.5 text-[11px] leading-4 text-[#afafaf]">Each square = {fmtGW(requested / WAFFLE_CELLS, 2)} (0.1% of requests)</div>
        </section>
      )}

      {/* 2. What public records account for. Kept apart from the phantom figure:
          a gap here is our coverage, not evidence that load is speculative. */}
      <section className="border-t border-[#efefef] pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="ub-body-md-strong text-[#5e5e5e]">Projects we found in public records</div>
          {spark.length > 1 && !noMw && (
            <div className="h-7 w-16 shrink-0" aria-label="Weekly evidence-weighted vs found GW">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
                  <Tooltip
                    labelFormatter={(v) => fmtMonth(Number(v))}
                    formatter={(v, name) => [fmtGW(Number(v), 2), name === "found" ? "Found" : "Weighted"]}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Area dataKey="found" type="stepAfter" stroke={INK.found} fill="#d1fae5" isAnimationActive={false} />
                  <Area dataKey="realistic" type="stepAfter" stroke={INK.weighted} fill="#a7f3d0" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        {noMw ? (
          <p className="ub-body-sm mt-1 text-[#5e5e5e]">MW estimate unavailable: MW_COST_PER_MW_USD not set</p>
        ) : (
          <div className="mt-2 space-y-2">
            {hasQueue && <Row label="Approved by ERCOT" gw={approved} of={approved} color={INK.approved} />}
            {s.found_gw != null && <Row label="Capacity tied to a project" gw={s.found_gw} of={hasQueue ? approved : null} color={INK.found} digits={2} />}
            {s.realistic_gw != null && (
              <Row label="Capacity backed by evidence" gw={s.realistic_gw} of={hasQueue ? approved : s.found_gw} color={INK.weighted} digits={2} />
            )}
          </div>
        )}
        <p className="mt-1.5 text-[12px] leading-4 text-[#5e5e5e]">
          {s.projects} projects · {s.projects_with_mw} with cost data.
          {hasQueue && s.found_gw != null && " Some ERCOT-approved load is not tied to a project record yet."}
        </p>
      </section>

      <footer className="mt-auto border-t border-[#efefef] pt-2 text-[11px] leading-4 text-[#afafaf]">
        {e && (
          <>
            ERCOT: <Source url={e.source_url} label={`queue ${fmtDate(e.ts)}`} />
            {e.approved_ts && (
              <>
                , <Source url={e.approved_source_url} label={`approvals ${fmtDate(e.approved_ts)}`} />
              </>
            )}
            {" · "}
          </>
        )}
        Records {fmtDate(s.as_of)} (TDLR, Comptroller, TCEQ)
      </footer>
    </div>
  );
}
