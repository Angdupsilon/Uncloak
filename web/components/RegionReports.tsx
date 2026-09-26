"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate, fmtMonth, isLink } from "@/lib/format";
import { datedSeries, forecastSeries, latestFigures, METRIC_LABEL, PUBLISHER, SCOPE_LABEL } from "@/lib/loadReports";
import type { LoadRegion, LoadReport, LoadReports } from "@/lib/types";

const LINE_COLORS = ["#000000", "#047857", "#8a8a8a", "#b45309", "#1d4ed8", "#be185d"];

const fmtLoad = (mw: number) => (Math.abs(mw) >= 1000 ? `${(mw / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} GW` : `${Math.round(mw).toLocaleString()} MW`);

export function regionLabel(r: LoadRegion): string {
  return r.region_key === "ERCO" ? "ERCOT (Texas)" : r.name;
}

/** Picker over the regions that have a load report. */
export function RegionSelect({
  regions,
  value,
  onChange,
  className = "",
}: {
  regions: LoadRegion[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  if (regions.length < 2) return null;
  const groups = new Map<string, LoadRegion[]>();
  for (const r of regions) groups.set(r.source_key, [...(groups.get(r.source_key) ?? []), r]);
  return (
    <label className={`flex items-center gap-2 text-[12px] text-[#5e5e5e] ${className}`}>
      <span className="shrink-0">Load report</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 truncate rounded-lg border border-[#e2e2e2] bg-white px-2 py-1 text-[12px] text-black"
        aria-label="Region whose load report to show"
      >
        {[...groups.entries()].map(([src, rs]) => (
          <optgroup key={src} label={PUBLISHER[src] ?? src}>
            {rs.map((r) => (
              <option key={r.region_key} value={r.region_key}>
                {regionLabel(r)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function SourceLine({ r }: { r: LoadReport }) {
  return (
    <span className="text-[11px] leading-4 text-[#afafaf]">
      {PUBLISHER[r.source_key] ?? r.source_key} ·{" "}
      {isLink(r.source_url) ? (
        <a href={r.source_url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-black" title={r.quote}>
          {r.document ?? "source"}
        </a>
      ) : (
        (r.document ?? "source")
      )}
    </span>
  );
}

function Figure({ r }: { r: LoadReport }) {
  return (
    <li className="border-t border-[#efefef] pt-2 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-[#5e5e5e]">
          {METRIC_LABEL[r.metric] ?? r.metric}
          {r.stage && r.metric !== "requested" ? <span className="text-[#afafaf]"> · {r.stage}</span> : null}
        </span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums text-black">{fmtLoad(r.value_mw)}</span>
      </div>
      <div className="text-[11px] leading-4 text-[#5e5e5e]">
        {SCOPE_LABEL[r.scope]} · as of {fmtDate(r.ts)}
      </div>
      {r.dc_share_pct != null && (
        <div className="text-[11px] leading-4 text-black">
          The same document says ~{r.dc_share_pct}% are data centers: &ldquo;{r.dc_share_quote}&rdquo;
        </div>
      )}
      <SourceLine r={r} />
    </li>
  );
}

/** A region's load-report figures: latest dated figures, then the forecast or report-by-report series. */
export default function RegionReports({ data, compact = false }: { data: LoadReports; compact?: boolean }) {
  const figures = latestFigures(data.rows);
  const forecasts = forecastSeries(data.rows);
  const dated = datedSeries(data.rows);
  const region = data.regions.find((r) => r.region_key === data.region);
  const chart = forecasts.length
    ? { kind: "forecast" as const, series: forecasts.map((f) => ({ key: f.key, label: f.label, points: f.points.map((p) => ({ x: p.year, mw: p.mw })) })) }
    : dated.length
      ? { kind: "dated" as const, series: dated.map((d) => ({ key: d.key, label: d.label, points: d.points.map((p) => ({ x: p.t, mw: p.mw })) })) }
      : null;
  const xs = chart ? [...new Set(chart.series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b) : [];
  const chartData = xs.map((x) => Object.fromEntries([["x", x], ...(chart?.series ?? []).map((s) => [s.key, s.points.find((p) => p.x === x)?.mw ?? null])]));

  if (!data.rows.length) return <p className="text-[12px] text-[#5e5e5e]">No report from this region on or before {fmtDate(data.as_of)}.</p>;

  return (
    <div className="flex flex-col gap-3">
      {region && (
        <div className="text-[12px] leading-4 text-[#5e5e5e]">
          <span className="font-medium text-black">{regionLabel(region)}.</span> {PUBLISHER[region.source_key] ?? region.source_key}. Figures are shown as
          published, each with its scope and date.
        </div>
      )}
      {figures.length > 0 && <ul className="flex flex-col gap-2">{(compact ? figures.slice(0, 4) : figures).map((r) => <Figure key={`${r.metric}|${r.stage}|${r.ts}`} r={r} />)}</ul>}
      {chart && (
        <figure>
          <figcaption className="text-[12px] text-[#5e5e5e]">
            {chart.kind === "forecast"
              ? `Forecast by year (report of ${fmtDate(forecasts[0].row.ts)}; ${SCOPE_LABEL[forecasts[0].scope].toLowerCase()})`
              : new Set(dated.map((d) => d.scope)).size > 1
                ? "Each report, by its as-of date. The publisher changed its category, so each category is its own series (dots)."
                : "Each report, by its as-of date"}
          </figcaption>
          <div className={compact ? "h-36" : "h-96"}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => (chart.kind === "forecast" ? String(v) : fmtMonth(Number(v)))}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tickFormatter={(v) => fmtLoad(Number(v))} tick={{ fontSize: 10 }} width={60} />
                <Tooltip
                  labelFormatter={(v) => (chart.kind === "forecast" ? String(v) : fmtDate(new Date(Number(v)).toISOString()))}
                  formatter={(v, name) => [fmtLoad(Number(v)), chart.series.find((s) => s.key === name)?.label ?? String(name)]}
                  contentStyle={{ fontSize: 11 }}
                />
                {!compact && <Legend formatter={(v) => chart.series.find((s) => s.key === v)?.label ?? String(v)} wrapperStyle={{ fontSize: 11 }} />}
                {chart.series.map((s, i) => (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                    dot={chart.kind === "dated" ? { r: 2.5 } : false}
                    strokeWidth={1.75}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {forecasts.length > 0 && <SourceLine r={forecasts[0].row} />}
        </figure>
      )}
      <p className="text-[11px] leading-4 text-[#afafaf]">
        Figures from different publishers are never added together. Uncloak compares a queue with the sites found in public records only for ERCOT.
      </p>
    </div>
  );
}
