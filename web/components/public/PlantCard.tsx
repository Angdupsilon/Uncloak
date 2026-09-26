"use client";
import Link from "next/link";
import { useState } from "react";
import { Area, AreaChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KindBadge, SampleBadge, Unavailable } from "@/components/public/ui";
import { fmtDate, fmtMW, fmtPct, isLink } from "@/lib/format";
import { METRICS, type MetricKey } from "@/lib/metrics";
import { REGION_RULES, TECH_COLORS, TECH_LABELS, USE_LABELS, batteryMw, fitsFor, unconstrainedDayShare } from "@/lib/spare";
import { useJson } from "@/lib/useJson";
import type { PlantDetail } from "@/lib/types";

const OUTPUT_SOURCE_LABELS: Record<string, string> = {
  CAMPD: "EPA CAMPD hourly gross load",
  EIA923_MODELED: "Modeled from weather and EIA-923 monthly generation",
  SAMPLE: "Sample synthetic profile (fake)",
};

function Heading({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h3 className="text-[15px] font-medium text-black">{children}</h3>
      {aside && <div className="rw-meta">{aside}</div>}
    </div>
  );
}

function Stat({ metric, value }: { metric: MetricKey; value: string | null }) {
  const m = METRICS[metric];
  return (
    <div className="flex min-w-0 flex-col bg-white px-3 py-3">
      <span className="text-[12px] leading-4 text-[var(--graphite)]">{m.label}</span>
      <div className="mt-1.5 text-[22px] leading-7 tracking-[-0.4px] text-black tabular-nums">
        {value ?? <Unavailable why="No hourly output loaded for this plant" />}
      </div>
      <div className="mt-2">
        <KindBadge kind={m.kind} />
      </div>
    </div>
  );
}

const yesNo = (v: boolean | null) => (v == null ? <Unavailable /> : v ? "Yes" : "No");

export default function PlantCard({ plantId, onClose }: { plantId: string | null; onClose: () => void }) {
  const detail = useJson<PlantDetail>(plantId ? `/api/plants/${encodeURIComponent(plantId)}` : null);
  const [batteryPick, setBatteryPick] = useState<{ id: string; mw: number } | null>(null);

  if (!plantId) return null;
  if (detail.error) {
    return (
      <div role="alert" className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-900">
        We couldn&apos;t load this plant. Try again in a moment.
      </div>
    );
  }
  const d = detail.data?.plant.plant_id === plantId ? detail.data : null;
  if (!d) return <div className="m-5 h-40 animate-pulse rounded-lg bg-[#efefef]" aria-hidden />;

  const p = d.plant;
  const fits = fitsFor(p);
  const suggested = batteryMw(p);
  const battery = batteryPick?.id === p.plant_id ? batteryPick.mw : Math.max(10, suggested);
  const dayShare = unconstrainedDayShare(d.daily_max_mw, p.connection_mw, battery);
  const rules = REGION_RULES[p.region];
  const duration = d.duration.map((x) => ({ pct: Math.round(x.coverage * 100), mw: x.spare_mw }));
  const color = TECH_COLORS[p.technology];
  const mw = (v: number | null) => (v == null ? null : fmtMW(v));

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--graphite)]">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {TECH_LABELS[p.technology]} · {p.region}
            {p.is_sample && <SampleBadge />}
          </div>
          <h2 className="mt-1 text-[22px] font-medium leading-7 tracking-[-0.4px] text-black">{p.name}</h2>
          <p className="rw-meta">{[p.owner, p.operating_year && `built ${p.operating_year}`, p.county && `${p.county} County`].filter(Boolean).join(" · ")}</p>
        </div>
        <button onClick={onClose} aria-label="Close plant details" className="text-2xl leading-none text-[var(--stone)] hover:text-black">
          ×
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--hairline)]">
          <Stat metric="plant_connection" value={fmtMW(p.connection_mw)} />
          <Stat metric="hours_over_half" value={p.share_over_half == null ? null : fmtPct(p.share_over_half)} />
          <Stat metric="spare_p80" value={mw(p.spare_p80_mw)} />
          <Stat metric="spare_p95" value={mw(p.spare_p95_mw)} />
        </section>

        {duration.length > 0 && (
          <section>
            <Heading aside={`${fmtDate(p.window_start)} – ${fmtDate(p.window_end)}`}>How often the room is free</Heading>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={duration} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                  <XAxis dataKey="pct" type="number" domain={[0, 100]} ticks={[0, 25, 50, 80, 95]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, p.connection_mw]} tickCount={4} allowDecimals={false} tick={{ fontSize: 11 }} width={44} />
                  <Tooltip formatter={(v) => [fmtMW(Number(v)), "Free"]} labelFormatter={(v) => `in at least ${v}% of hours`} contentStyle={{ fontSize: 11 }} />
                  <ReferenceLine x={80} stroke="#939393" strokeDasharray="3 3" />
                  <ReferenceLine x={95} stroke="#939393" strokeDasharray="3 3" />
                  <Area dataKey="mw" type="monotone" stroke="#000000" fill="#e8eaed" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="rw-meta mt-1">Read across: the MW of connection left unused in at least that share of the year&apos;s hours.</p>
          </section>
        )}

        {d.profile.length > 0 && (
          <section>
            <Heading aside="Central time">Average output by hour</Heading>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.profile} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                  <XAxis dataKey="hour" ticks={[0, 6, 12, 18, 23]} tickFormatter={(h) => `${h}:00`} tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, p.connection_mw]} tickCount={4} allowDecimals={false} tick={{ fontSize: 11 }} width={44} />
                  <Tooltip
                    formatter={(v, name) => [fmtMW(Number(v)), name === "summer_mw" ? "Jun–Sep" : "Rest of year"]}
                    labelFormatter={(h) => `${h}:00`}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <ReferenceLine y={p.connection_mw} stroke="#000000" strokeDasharray="4 3" />
                  <Line dataKey="summer_mw" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="rest_mw" stroke="#939393" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="rw-meta mt-1 flex flex-wrap gap-x-4">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3" style={{ background: color }} /> Jun–Sep
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 bg-[#939393]" /> Rest of year
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 border-t border-dashed border-black" /> Connection limit
              </span>
            </div>
          </section>
        )}

        <section>
          <Heading aside={<KindBadge kind="derived" />}>Best-fit uses</Heading>
          {fits.length === 0 ? (
            <p className="text-[14px] text-[var(--graphite)]">
              {p.hours == null ? "Unavailable until hourly output is loaded for this plant." : "Nothing passes the screen: the connection is rarely free enough."}
            </p>
          ) : (
            <ol className="space-y-2">
              {fits.map((f, i) => (
                <li key={f.use} className="rounded-lg border border-[var(--hairline)] px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-medium text-black">
                      {i + 1}. {f.title}
                    </span>
                    <span className="rw-meta shrink-0">{USE_LABELS[f.use]}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-5 text-[var(--graphite)]">{f.reason}</p>
                  {f.caveat && <p className="text-[13px] leading-5 text-amber-800">{f.caveat}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>

        {d.daily_max_mw.length > 0 && (
          <section>
            <Heading aside={`Suggested ${suggested} MW`}>Size a battery</Heading>
            <input
              type="range"
              min={10}
              max={Math.max(10, Math.floor(p.connection_mw / 10) * 10)}
              step={10}
              value={battery}
              onChange={(e) => setBatteryPick({ id: p.plant_id, mw: Number(e.target.value) })}
              className="w-full accent-black"
              aria-label="Battery size in MW"
            />
            <p className="mt-1 text-[14px] leading-5 text-[var(--graphite)]">
              A <span className="font-medium text-black">{battery} MW</span> battery fits under the connection in every hour on{" "}
              <span className="font-medium text-black">{fmtPct(dayShare)}</span> of days. On the other days it must throttle while the plant runs.
            </p>
          </section>
        )}

        <section>
          <Heading>Site details</Heading>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[14px]">
            <dt className="text-[var(--graphite)]">Adjacent open land</dt>
            <dd className="text-right text-black">{p.open_acres == null ? <Unavailable /> : `~${Math.round(p.open_acres)} acres`}</dd>
            <dt className="text-[var(--graphite)]">Fiber within 2 miles</dt>
            <dd className="text-right text-black">{yesNo(p.fiber_within_2mi)}</dd>
            <dt className="text-[var(--graphite)]">Water nearby</dt>
            <dd className="text-right text-black">{yesNo(p.water_nearby)}</dd>
            <dt className="text-[var(--graphite)]">Planned retirement</dt>
            <dd className="text-right text-black">{p.retirement_year ?? "None reported"}</dd>
          </dl>
          {p.retirement_year != null && <p className="rw-meta mt-2">A retiring plant&apos;s owner may welcome a new use for the connection.</p>}
        </section>

        {rules && (
          <section className="rounded-lg bg-[var(--canvas-softer)] px-4 py-3">
            <div className="flex items-center gap-2">
              <KindBadge kind="context" />
              <span className="text-[14px] font-medium text-black">{rules.title}</span>
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-[var(--graphite)]">{rules.body}</p>
          </section>
        )}

        <section className="rw-meta space-y-1 border-t border-[var(--hairline)] pt-3">
          <p>
            Output: {OUTPUT_SOURCE_LABELS[p.output_source] ?? p.output_source}.{" "}
            {isLink(p.source_url) && (
              <a href={p.source_url} target="_blank" rel="noreferrer" className="rw-link">
                Source<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </p>
          <p>
            <Link href="/methodology#spare-capacity" className="rw-link">
              How these figures and screens are calculated
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
