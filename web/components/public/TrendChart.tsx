"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate, fmtMonth } from "@/lib/format";
import type { OrgTrendPoint } from "@/lib/types";

/** Weekly count of sites with public-record evidence, with an equivalent data table. */
export default function TrendChart({ points, name }: { points: OrgTrendPoint[]; name: string }) {
  const data = points.map((p) => ({ t: Date.parse(p.week), sites: p.sites, mw: p.mw }));
  const hasMw = data.some((d) => d.mw != null);
  // Table: one row per change, so it stays short.
  const changes = points.filter((p, i) => i === 0 || p.sites !== points[i - 1].sites || p.mw !== points[i - 1].mw);

  return (
    <div className="space-y-6">
      <figure>
        <figcaption className="mb-2 text-[14px] font-medium text-black">Sites with at least one public record, by week</figcaption>
        <div className="h-64 w-full" aria-hidden>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#eee" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtMonth} fontSize={12} stroke="#888" />
              <YAxis allowDecimals={false} fontSize={12} stroke="#888" />
              <Tooltip labelFormatter={(t) => `Week of ${fmtDate(new Date(Number(t)).toISOString())}`} formatter={(v) => [v, "sites"]} />
              <Line type="stepAfter" dataKey="sites" stroke="#000" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
      {hasMw && (
        <figure>
          <figcaption className="mb-2 text-[14px] font-medium text-black">
            Estimated power demand of those sites, by week (MW, <span className="text-sky-800">Uncloak estimate</span>)
          </figcaption>
          <div className="h-48 w-full" aria-hidden>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                <CartesianGrid stroke="#eee" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtMonth} fontSize={12} stroke="#888" />
                <YAxis fontSize={12} stroke="#888" />
                <Tooltip
                  labelFormatter={(t) => `Week of ${fmtDate(new Date(Number(t)).toISOString())}`}
                  formatter={(v) => [v == null ? "Unavailable" : `${Math.round(Number(v)).toLocaleString()} MW`, "estimated"]}
                />
                <Line type="stepAfter" dataKey="mw" stroke="#0369a1" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
      <details className="rounded-xl border border-[var(--hairline)] bg-white p-4">
        <summary className="cursor-pointer text-[14px] font-semibold text-black">Show this trend as a table</summary>
        <div className="relative mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[13px]">
            <caption className="sr-only">Weeks when the number of {name} sites or their estimated power changed</caption>
            <thead className="text-[var(--body)]">
              <tr>
                <th scope="col" className="py-1.5 pr-4 font-medium">Week of</th>
                <th scope="col" className="py-1.5 pr-4 text-right font-medium">Sites with records</th>
                <th scope="col" className="py-1.5 text-right font-medium">Estimated MW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)]">
              {changes.map((p) => (
                <tr key={p.week}>
                  <td className="py-1.5 pr-4">{fmtDate(p.week)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{p.sites}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.mw == null ? "Unavailable" : Math.round(p.mw).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
