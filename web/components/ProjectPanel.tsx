"use client";
import { TIER_COLORS, TIER_LABELS, UNRESOLVED_PARENT } from "@/lib/constants";
import { describeEvent, fmtDate, fmtMW, fmtPct, fmtUSD } from "@/lib/format";
import { countyLabel, STATE_NAMES } from "@/lib/geo";
import { useJson } from "@/lib/useJson";
import type { EvidenceEvent, FactorConfig, Timeline } from "@/lib/types";
import TimeMachine from "./TimeMachine";
import { SourceLink } from "./public/Source";

function SectionHeading({ children, detail }: { children: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{children}</h3>
      {detail && <div className="text-[11px] text-slate-400">{detail}</div>}
    </div>
  );
}

function MetricCard({ label, value, detail, color }: { label: string; value: string; detail?: string; color?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5">
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold leading-none tracking-tight text-slate-900" style={{ color }}>
        {value}
      </div>
      {detail && <div className="mt-1.5 truncate text-[11px] text-slate-500">{detail}</div>}
    </div>
  );
}

/** The event that satisfied a factor (e.g. the 2nd registration for multi_building). */
function evidenceFor(f: FactorConfig, events: EvidenceEvent[]): EvidenceEvent | null {
  const matching = events.filter((e) => e.event_type === f.event_type);
  if (f.min_sum != null) {
    let sum = 0;
    for (const e of matching) {
      sum += e.value_num ?? 0;
      if (sum >= f.min_sum) return e;
    }
    return null;
  }
  return matching[(f.min_count ?? 1) - 1] ?? null;
}

export default function ProjectPanel({
  projectId,
  asOf,
  factors,
  onClose,
}: {
  projectId: number | null;
  asOf: string;
  factors: FactorConfig[];
  onClose: () => void;
}) {
  const { data, loading, error } = useJson<Timeline>(projectId != null ? `/api/projects/${projectId}/timeline?as_of=${asOf}` : null);

  if (projectId == null) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 text-center">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 shadow-sm">
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 21s7-5.25 7-12a7 7 0 1 0-14 0c0 6.75 7 12 7 12Z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-slate-800">Select a project</div>
        <p className="mt-1.5 max-w-[270px] text-xs leading-5 text-slate-500">
          Choose a marker on the map to review its ownership, evidence score, and history.
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <div className="font-semibold">Could not load project</div>
        <div className="mt-1 text-xs text-red-600">{error}</div>
      </div>
    );
  }

  if (!data || data.project.project_id !== projectId) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-700" />
        Loading project
      </div>
    );
  }

  const p = data.project;
  const scored = p.probability != null;
  const events = data.events;
  const satisfied = factors.filter((factor) => !!p.factors?.[factor.key]).length;
  const osmOperator = p.resolved_by === "OSM_OPERATOR";
  const entityName = p.llc_name?.replace(/ \(OSM operator\)$/, "") ?? null;
  const atlasOnly = events.length > 0 && events.every((e) => e.event_type === "site_mapped");

  return (
    <div className={`flex h-full flex-col bg-white transition-opacity ${loading ? "opacity-70" : ""}`}>
      <header className="z-10 shrink-0 border-b border-slate-200/80 bg-white/95 px-5 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-700">Project profile</span>
              {p.is_sample && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">Sample</span>
              )}
            </div>
            <h2 className="truncate text-base font-semibold leading-tight text-slate-950" title={p.name}>
              {p.name}
            </h2>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 14s4.5-3.4 4.5-7.75a4.5 4.5 0 1 0-9 0C3.5 10.6 8 14 8 14Z" />
                <circle cx="8" cy="6.25" r="1.5" />
              </svg>
              <span className="truncate">{[p.city, p.county && countyLabel(p.county, p.state), p.state].filter(Boolean).join(", ")}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-transparent text-slate-400 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700"
            aria-label="Close project details"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6 px-5 py-5">
          <section>
            <SectionHeading detail={<SourceLink url={p.entity_source_url} />}>Ownership</SectionHeading>
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgb(15_23_42/0.03)]">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{osmOperator ? "Operator tag" : "Registered entity"}</div>
                  <div className="mt-1 truncate text-sm font-medium text-slate-700" title={entityName ?? "Unknown LLC"}>
                    {entityName ?? (atlasOnly ? "No operator mapped" : "Unknown LLC")}
                  </div>
                </div>
                <div className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-slate-400">→</div>
                <div className="min-w-0 text-right">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Parent company</div>
                  <div className="mt-1 truncate text-sm font-semibold" title={p.parent ?? UNRESOLVED_PARENT} style={{ color: p.parent_color ?? undefined }}>
                    {p.parent ?? UNRESOLVED_PARENT}
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                {osmOperator
                  ? "Operator named in OpenStreetMap, not a registered-entity record"
                  : p.resolved_by
                    ? `Ownership resolved via ${p.resolved_by}`
                    : "Parent company has not been resolved"}
              </div>
            </div>
          </section>

          <section>
            <SectionHeading detail={scored ? `Updated ${fmtDate(p.scored_at)}` : undefined}>Project snapshot</SectionHeading>
            <div className="grid grid-cols-3 gap-2">
              <MetricCard
                label="Evidence score"
                value={fmtPct(p.probability)}
                detail={scored ? TIER_LABELS[p.tier!] : "Not scored"}
                color={scored ? TIER_COLORS[p.tier!] : undefined}
              />
              <MetricCard
                label={p.sourced_mw != null ? `${p.capacity_type ?? "Sourced"} load` : "Modeled load"}
                value={fmtMW(p.sourced_mw ?? p.mw_est)}
                detail={p.sourced_mw != null ? "Public-source figure" : "From registered cost"}
              />
              <MetricCard label="Registered cost" value={fmtUSD(p.total_cost)} />
            </div>
          </section>

          <section>
            <SectionHeading detail={<SourceLink url={p.location_source_url} label="Location source" />}>Data quality</SectionHeading>
            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-600">
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Canonical site</span>
                <span className="truncate text-right font-medium text-slate-700">{p.site_name ?? "Not linked"}</span>
              </div>
              <div className="mt-2 flex justify-between gap-4 border-t border-slate-100 pt-2">
                <span className="text-slate-400">Lifecycle</span>
                <span className="text-right font-medium text-slate-700">
                  {p.current_status?.replaceAll("_", " ") ?? "Unknown"}
                  {p.status_observed_at ? ` · observed ${fmtDate(p.status_observed_at)}` : ""}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-4 border-t border-slate-100 pt-2">
                <span className="text-slate-400">Location quality</span>
                <span className="text-right font-medium text-slate-700">
                  {p.location_precision ?? "Unknown"}
                  {p.location_confidence != null ? ` · ${Math.round(p.location_confidence * 100)}% confidence` : ""}
                </span>
              </div>
            </div>
          </section>

          <section>
            <SectionHeading detail={scored ? `${satisfied} of ${factors.length} signals · ${p.score} pts` : "Not scored yet"}>Evidence signals</SectionHeading>
            {p.state !== "TX" ? (
              <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                These signals are Texas record types (TDLR, Comptroller, TCEQ). {STATE_NAMES[p.state] ?? p.state} has no
                equivalent loaded yet, so an unmet signal here means “not published here”, not “checked and missing”.
              </p>
            ) : (
              atlasOnly && (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                  Mapped from the IM3 data-center atlas only. No Texas public record has been matched to this site yet.
                </p>
              )
            )}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {factors.map((factor, index) => {
                const ok = !!p.factors?.[factor.key];
                const event = ok ? evidenceFor(factor, events) : null;
                return (
                  <div
                    key={factor.key}
                    className={`grid grid-cols-[24px_1fr_auto] items-start gap-2.5 px-3 py-2.5 ${index ? "border-t border-slate-100" : ""}`}
                  >
                    <span
                      className={`mt-px grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${
                        ok ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {ok ? "✓" : "–"}
                    </span>
                    <div className="min-w-0">
                      <div className={`text-xs leading-5 ${ok ? "font-medium text-slate-700" : "text-slate-400"}`}>{factor.rule}</div>
                      {event?.source_url && <div className="mt-0.5 text-[10px]"><SourceLink url={event.source_url} label="View evidence" /></div>}
                    </div>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${ok ? "bg-teal-50 text-teal-700" : "bg-slate-50 text-slate-400"}`}>
                      +{factor.points}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <SectionHeading>Score over time</SectionHeading>
            <div className="rounded-xl border border-slate-200 bg-white px-2 pb-1 pt-2 shadow-[0_1px_2px_rgb(15_23_42/0.03)]">
              <TimeMachine scores={data.scores} events={events} />
            </div>
          </section>

          <section>
            <SectionHeading detail={`${events.length} record${events.length === 1 ? "" : "s"}`}>Evidence history</SectionHeading>
            {events.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-xs text-slate-500">
                No evidence on or before this date.
              </div>
            ) : (
              <ol className="relative ml-2 border-l border-slate-200">
                {[...events].reverse().map((event, index) => (
                  <li key={`${event.ts}-${event.event_type}-${index}`} className="relative pb-4 pl-5 last:pb-0">
                    <span className="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full border-2 border-white bg-slate-400 ring-1 ring-slate-200" />
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500">{fmtDate(event.ts)}</span>
                        <span className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                          {event.source}
                        </span>
                      </div>
                      <span className="shrink-0 text-[10px]"><SourceLink url={event.source_url} /></span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-700">{describeEvent(event)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
