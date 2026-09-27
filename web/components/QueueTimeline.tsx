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
import { INK } from "@/components/SummaryBar";
import { fmtDate, fmtGW, fmtMonth } from "@/lib/format";
import type { QueueTimeline as QueueTimelineData, QueueWeek } from "@/lib/types";

/** One colour per stage, shared by the stage bars (which double as the chart legend) and the chart. */
const STAGE_COLORS = {
  requested: "#afafaf",
  approved: INK.approved,
  energized: INK.energized,
  found: INK.found,
  likely: INK.weighted,
};

type StageKey = keyof typeof STAGE_COLORS;

const STAGES: { key: StageKey; label: string; hint: string; value: (w: QueueWeek) => number | null }[] = [
  { key: "requested", label: "Asked to connect", hint: "Every large user in ERCOT's line (75 MW+ sites)", value: (w) => w.gw_requested },
  { key: "approved", label: "Approved to connect", hint: "ERCOT has cleared them to switch on", value: (w) => w.gw_approved },
  { key: "energized", label: "Actually using power", hint: "Highest large-load draw ERCOT has observed", value: (w) => w.gw_observed_peak },
  { key: "found", label: "Visible in public records", hint: "Permits, building registrations, tax filings we found", value: (w) => w.found_gw },
  { key: "likely", label: "Likely to be built", hint: "Our estimate: each project weighted by its evidence", value: (w) => w.realistic_gw },
];

type Row = {
  t: number;
  requested: number | null;
  approved: number | null;
  energized: number | null;
  found: number | null;
  likely: number | null;
  band: [number, number] | null;
  /** Set on the first week a new ERCOT report applies, so the report shows as a dot. */
  report: number | null;
  w: QueueWeek;
};

const day = (iso: string) => iso.slice(0, 10);
const pos = (v: number | null, log: boolean) => (v == null ? null : log && v <= 0 ? null : v);

/** "1.9" MW out of every 100 MW requested. */
function per100(part: number | null, whole: number | null): string | null {
  if (part == null || whole == null || whole <= 0) return null;
  const p = (part / whole) * 100;
  if (p >= 10) return p.toFixed(0);
  if (p >= 0.1) return p.toFixed(1);
  return p > 0 ? "less than 0.1" : "0";
}

function share(part: number | null, whole: number | null): string {
  if (part == null || whole == null || whole <= 0) return "";
  const p = (part / whole) * 100;
  if (p >= 99.95) return "100%";
  if (p >= 0.1) return `${p.toFixed(1)}%`;
  return p > 0 ? "<0.1%" : "0%";
}

function signedMW(gw: number | null) {
  if (gw == null) return null;
  const mw = Math.round(gw * 1000);
  return `${mw >= 0 ? "+" : "−"}${Math.abs(mw).toLocaleString()} MW`;
}

// ---------------------------------------------------------------------------
// "When could I connect?" Only sourced figures; no invented per-project dates.
// ---------------------------------------------------------------------------

const SRC = {
  ercotBatch: {
    label: "ERCOT, Jun 2026",
    url: "https://www.ercot.com/files/docs/2026/06/18/ERCOT-Trending-Topic-New-Batch-Connection-Process-for-Large-Electricity-Users.pdf",
  },
  ercotQA: { label: "ERCOT large-load Q&A", url: "https://www.ercot.com/files/docs/2025/12/24/Large-Load-Interconnection-Process-Q-A.pdf" },
  belfer: { label: "Harvard Belfer Center", url: "https://www.belfercenter.org/research-analysis/data-centers-texas-virginia-comparison" },
  lbnl: { label: "Berkeley Lab, Queued Up 2026", url: "https://emp.lbl.gov/publications/queued-2026-edition-characteristics" },
};
type Source = (typeof SRC)[keyof typeof SRC];

type Sector = {
  label: string;
  /** Goes through ERCOT's large-load study (sites of 75 MW or more). */
  largeLoad: boolean;
  /** Month ranges from today, each with what drives it. */
  paths: { label: string; months: [number, number]; source: Source }[];
  note: string;
};

const SECTORS: Record<string, Sector> = {
  datacenter: {
    label: "Data center (75 MW+)",
    largeLoad: true,
    paths: [
      { label: "Grid already has room: the building sets the date", months: [18, 24], source: SRC.belfer },
      { label: "New high-voltage lines needed: the grid sets the date", months: [84, 120], source: SRC.belfer },
    ],
    note: "A hyperscale building takes 18–24 months; high-voltage transmission upgrades take 7–10 years to plan, approve and build.",
  },
  crypto: {
    label: "Crypto mining (75 MW+)",
    largeLoad: true,
    paths: [{ label: "New high-voltage lines needed", months: [84, 120], source: SRC.belfer }],
    note: "Same ERCOT study as data centers. Sites at substations with spare room move faster; there is no reliable published build time.",
  },
  industrial: {
    label: "Industrial plant (75 MW+)",
    largeLoad: true,
    paths: [{ label: "New high-voltage lines needed", months: [84, 120], source: SRC.belfer }],
    note: "Chip fabs, hydrogen and oil & gas electrification use the same 75 MW+ study. Build time depends on the plant.",
  },
  small: {
    label: "Any site under 75 MW",
    largeLoad: false,
    paths: [],
    note: "Below ERCOT's 75 MW large-user line, your local utility handles the connection, not ERCOT's large-load study. Ask the utility for its current lead time.",
  },
  generation: {
    label: "Power plant (you sell power)",
    largeLoad: false,
    paths: [{ label: "Typical wait in the generator queue (US median)", months: [61, 61], source: SRC.lbnl }],
    note: "Generators use a separate queue. The median US project that came online in 2025 waited 61 months, up from 36 months in 2015.",
  },
};

/** ERCOT's own status categories, in order (ERCOT large-load Q&A). */
const ERCOT_STEPS: { label: string; next: string }[] = [
  {
    label: "Not requested yet",
    next: "Ask your transmission utility (TSP) for a large-load interconnection study. Since July 2026 ERCOT studies requests in batches, so timing depends on which batch you make.",
  },
  {
    label: "Study underway",
    next: "Your utility is running the Large Load Interconnection Study. Most of ERCOT's line sits at this step. Once submitted, it goes to ERCOT for review.",
  },
  {
    label: "Under ERCOT review",
    next: "ERCOT review takes a few days to many weeks, often waiting on answers from your utility. After approval you decide whether to sign an interconnection agreement.",
  },
  {
    label: "Studies approved",
    next: "Sign the interconnection agreement and post security. If upgrades are needed, your load plan follows the date those upgrades come online. Approval does not guarantee energization.",
  },
  {
    label: "Built, awaiting OK",
    next: "ERCOT checks the load is in its grid model, telemetry works and stability studies pass before approving energization. Fewer than 1% of loads sit here, because approved sites switch on quickly.",
  },
];

function addMonths(isoDay: string, months: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", timeZone: "UTC" });
}

function SourceLink({ s }: { s: Source }) {
  return (
    <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-black">
      {s.label}
    </a>
  );
}

function ConnectPlanner({ today }: { today: string }) {
  const [sectorKey, setSectorKey] = useState("datacenter");
  const [step, setStep] = useState(0);
  const sector = SECTORS[sectorKey];

  return (
    <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,5fr)]">
      <div className="flex flex-col gap-3">
        <label className="ub-caption flex flex-col gap-1 text-[#5e5e5e]">
          What are you connecting?
          <select
            value={sectorKey}
            onChange={(e) => setSectorKey(e.target.value)}
            className="ub-body-sm rounded-lg border border-[#e2e2e2] bg-white px-2 py-1.5 text-black"
          >
            {Object.entries(SECTORS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <p className="ub-caption text-[#5e5e5e]">{sector.note}</p>
      </div>

      <div>
        <div className="ub-caption text-[#5e5e5e]">If you started today ({fmtDate(today)}), power could arrive:</div>
        {sector.paths.length === 0 && <div className="ub-body-md-strong mt-1 text-black">Ask your local utility</div>}
        <ul className="mt-1 flex flex-col gap-2">
          {sector.paths.map((p) => (
            <li key={p.label}>
              <div className="ub-body-md-strong text-black">
                {p.months[0] === p.months[1] ? `around ${addMonths(today, p.months[0])}` : `${addMonths(today, p.months[0])} – ${addMonths(today, p.months[1])}`}
              </div>
              <div className="ub-caption text-[#5e5e5e]">
                {p.label} · <SourceLink s={p.source} />
              </div>
            </li>
          ))}
        </ul>
        <p className="ub-caption mt-2 text-[#afafaf]">Typical ranges from published studies, not a promise for any one site.</p>
      </div>

      <div>
        {sector.largeLoad ? (
          <>
            <div className="ub-caption text-[#5e5e5e]">Where are you in ERCOT&apos;s process?</div>
            <ol className="mt-1 flex flex-wrap gap-1">
              {ERCOT_STEPS.map((s, i) => (
                <li key={s.label}>
                  <button
                    onClick={() => setStep(i)}
                    className={`ub-caption rounded-full border px-2 py-0.5 ${
                      i === step ? "border-black bg-black text-white" : i < step ? "border-[#c9c9c9] bg-[#f3f3f3] text-[#5e5e5e]" : "border-[#e2e2e2] text-[#5e5e5e]"
                    }`}
                  >
                    {i + 1}. {s.label}
                  </button>
                </li>
              ))}
            </ol>
            <p className="ub-body-sm mt-2 text-black">
              <span className="font-semibold">Next: </span>
              {ERCOT_STEPS[step].next}
            </p>
            <p className="ub-caption mt-1 text-[#afafaf]">
              <SourceLink s={SRC.ercotQA} /> · <SourceLink s={SRC.ercotBatch} />
            </p>
          </>
        ) : (
          <p className="ub-body-sm text-[#5e5e5e]">ERCOT&apos;s large-load steps don&apos;t apply to this kind of project.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StageBars({ w }: { w: QueueWeek }) {
  const whole = w.gw_requested;
  return (
    <ul className="flex flex-col gap-1.5">
      {STAGES.map((s) => {
        const v = s.value(w);
        const pct = v != null && whole ? Math.min(100, (v / whole) * 100) : 0;
        return (
          <li key={s.key} title={s.hint}>
            <div className="ub-caption flex items-baseline justify-between gap-2">
              <span className="truncate text-black">{s.label}</span>
              <span className="shrink-0 tabular-nums text-[#5e5e5e]">
                {fmtGW(v, v != null && v < 10 ? 2 : 1)}
                {s.key !== "requested" && whole ? ` · ${share(v, whole)}` : ""}
              </span>
            </div>
            <div className="mt-0.5 h-2 w-full rounded-full bg-[#f3f3f3]">
              <div
                className="h-2 rounded-full"
                style={{ width: v ? `max(${pct}%, 3px)` : 0, background: STAGE_COLORS[s.key] }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function QueueTimeline({
  data,
  error,
  asOf,
  today,
  onPick,
  variant = "strip",
}: {
  data: QueueTimelineData | null;
  error: string | null;
  asOf: string;
  today: string;
  onPick: (asOf: string) => void;
  /** "strip" is the collapsible dashboard card; "page" is the full-width Queue Timeline tab. */
  variant?: "strip" | "page";
}) {
  const isPage = variant === "page";
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<"queue" | "connect">("queue");
  const [log, setLog] = useState(true);

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
          energized: pos(w.gw_observed_peak, log),
          found,
          likely: pos(w.realistic_gw, log),
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

  const approved100 = current ? per100(current.gw_approved, current.gw_requested) : null;
  const found100 = current ? per100(current.found_gw, current.gw_requested) : null;
  const delta = current ? signedMW(current.realistic_gw_delta) : null;

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      onClick={() => {
        setTab(key);
        setOpen(true);
      }}
      className={`ub-caption rounded-full px-3 py-1 ${tab === key && open ? "bg-black text-white" : "text-[#5e5e5e] hover:bg-[#f3f3f3]"}`}
    >
      {label}
    </button>
  );

  return (
    <section className={`ub-card shrink-0 overflow-hidden ${isPage ? "px-4 py-5 sm:px-6" : "px-4 py-3"}`}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {!isPage && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 shrink-0 text-[#5e5e5e]"
          aria-expanded={open}
          aria-label={open ? "Collapse queue timeline" : "Expand queue timeline"}
        >
          <span aria-hidden className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        </button>
        )}

        <div className="min-w-[min(100%,18rem)] flex-1">
          {current && approved100 != null ? (
            <>
              <p className={isPage ? "text-[18px] leading-7 text-black sm:text-[20px]" : "ub-body-md text-black"}>
                Of every <b>100 MW</b> asking to join the Texas grid, only <b>{approved100} MW</b> is approved to connect
                {found100 != null && (
                  <>
                    {" "}and <b className="text-[#047857]">{found100} MW</b> shows up in public construction records
                  </>
                )}
                .
              </p>
              <p className="ub-caption mt-0.5 text-[#5e5e5e]">
                Week of {fmtDate(day(current.week))}
                {delta && ` · likely-to-be-built demand ${delta} this week`}
                {` · ${current.projects_up} project${current.projects_up === 1 ? "" : "s"} gained evidence`}
                {` · ${current.projects_new} new`}
              </p>
            </>
          ) : (
            <p className="ub-body-sm text-[#afafaf]">{error ? `Queue timeline unavailable: ${error}` : data ? "No scored weeks yet" : "Loading…"}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {tabBtn("queue", "The queue")}
          {tabBtn("connect", "When could I connect?")}
        </div>
      </div>

      {open && tab === "connect" && <ConnectPlanner today={today} />}

      {open && tab === "queue" && (
        <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>{current ? <StageBars w={current} /> : null}</div>

          <div className="flex min-w-0 flex-col">
            <div className="ub-caption flex items-start justify-between gap-3 text-[#5e5e5e]">
              <span>How each stage has changed · click a week to jump there</span>
              <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                <input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} />
                Log scale
              </label>
            </div>
            {noErcot && (
              <div className="ub-caption text-amber-700">No ERCOT queue reports loaded yet: run etl/import_load_reports.py and load data/seed to draw the queue line.</div>
            )}
            <div className={isPage ? "h-[300px]" : "h-[140px]"}>
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
                      if (name === "Not visible in public records" && Array.isArray(v)) return [fmtGW(Number(v[1]) - Number(v[0])), name];
                      if (name === "New ERCOT report") {
                        const ts = (item?.payload as Row | undefined)?.w.ercot_ts;
                        return [ts ? `dated ${fmtDate(ts)}` : "", name];
                      }
                      return [fmtGW(Number(v), 2), name];
                    }}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Area dataKey="band" name="Not visible in public records" type="stepAfter" stroke="none" fill={INK.phantom} fillOpacity={0.7} isAnimationActive={false} connectNulls={false} />
                  <Line dataKey="requested" name="Asked to connect" type="stepAfter" stroke={STAGE_COLORS.requested} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="approved" name="Approved to connect" type="stepAfter" stroke={STAGE_COLORS.approved} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  <Line dataKey="energized" name="Actually using power" type="stepAfter" stroke={STAGE_COLORS.energized} dot={false} isAnimationActive={false} />
                  <Line dataKey="found" name="Visible in public records" type="stepAfter" stroke={STAGE_COLORS.found} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="likely" name="Likely to be built" type="stepAfter" stroke={STAGE_COLORS.likely} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="report" name="New ERCOT report" stroke="none" dot={{ r: 3, fill: STAGE_COLORS.requested, stroke: "#fff" }} activeDot={false} connectNulls={false} isAnimationActive={false} legendType="none" />
                  <ReferenceLine x={cursor} stroke="#0f172a" strokeDasharray="2 2" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
