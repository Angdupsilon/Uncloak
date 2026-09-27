"use client";
import { TIER_COLORS, TIER_LABELS, UNRESOLVED_PARENT } from "@/lib/constants";
import { describeEvent, fmtDate, fmtMW, fmtPct, fmtUSD } from "@/lib/format";
import { useJson } from "@/lib/useJson";
import type { EvidenceEvent, FactorConfig, Timeline } from "@/lib/types";
import StageClip from "@/components/StageClip";
import { stageFor } from "@/lib/stages";
import TimeMachine from "./TimeMachine";
import { SourceLink } from "./public/Source";

function SectionHeading({ children, detail }: { children: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="ub-eyebrow">{children}</h3>
      {detail && <div className="rw-meta">{detail}</div>}
    </div>
  );
}

function MetricCard({ label, value, detail, color }: { label: string; value: string; detail?: string; color?: string }) {
  return (
    <div className="min-w-0">
      <div className="ub-eyebrow truncate">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold leading-none tracking-tight text-[var(--ink)]" style={{ color }}>
        {value}
      </div>
      {detail && <div className="mt-1.5 truncate text-[13px] text-[var(--slate)]">{detail}</div>}
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
  const { data, error } = useJson<Timeline>(projectId != null ? `/api/projects/${projectId}/timeline?as_of=${asOf}` : null);

  if (projectId == null) {
    return (
      <div className="rw flex h-full flex-col items-center justify-center px-10 text-center">
        <div className="mb-4 grid h-12 w-12 place-items-center bg-white text-[var(--slate)] shadow-sm">
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 21s7-5.25 7-12a7 7 0 1 0-14 0c0 6.75 7 12 7 12Z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-[var(--ink)]">Select a project</div>
        <p className="mt-1.5 max-w-[270px] text-xs leading-5 text-[var(--slate)]">
          Choose a marker on the map to review its ownership, evidence score, and history.
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="m-4 rounded-lg bg-[var(--rw-hairline)] p-3 text-[13px] text-[var(--graphite)]">
        <div className="font-semibold">Could not load project</div>
        <div className="mt-1 text-[13px] text-[var(--graphite)]">{error}</div>
      </div>
    );
  }

  if (!data?.project || data.project.project_id !== projectId) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--slate)]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--rw-hairline)] border-t-[var(--ink)]" />
        Loading project
      </div>
    );
  }

  const p = data.project;
  const scored = p.probability != null;
  const events = data.events;
  const satisfied = factors.filter((factor) => !!p.factors?.[factor.key]).length;

  // Stage is derived from the same as-of factors the checklist uses, so it
  // advances in step with the date slider rather than on its own clock.
  const stage = stageFor({
    factors: p.factors ?? null,
    currentStatus: p.current_status ?? null,
    hasAnyEvidence: (data?.events?.length ?? 0) > 0,
  });

  return (
    // Keep the previous, complete project snapshot visible while the next
    // timeline loads. Playback changes the date frequently, so fading this
    // whole panel for each request reads as a distracting blink.
    <div className="flex h-full flex-col bg-white">
      <header className="z-10 shrink-0 border-b border-[var(--rw-hairline)] bg-white/95 px-5 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {p.is_sample && (
              <span className="mb-1.5 inline-block rounded-full bg-[var(--rw-hairline)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--ink)]">
                Sample
              </span>
            )}
            <h2 className="truncate rw-heading-sm text-[var(--ink)]" title={p.name}>
              {p.name}
            </h2>
            <div className="mt-1 flex items-center gap-1.5 rw-meta">
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 14s4.5-3.4 4.5-7.75a4.5 4.5 0 1 0-9 0C3.5 10.6 8 14 8 14Z" />
                <circle cx="8" cy="6.25" r="1.5" />
              </svg>
              <span className="truncate">{[p.city, p.county && `${p.county} County`].filter(Boolean).join(", ") || "Location unknown"}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-transparent text-[var(--slate)] transition-colors hover:border-[var(--rw-hairline)] hover:bg-white hover:text-[var(--graphite)]"
            aria-label="Close project details"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* One faint rule between sections. Note the literal colour: an opacity
            modifier on an arbitrary CSS variable (divide-[var(--x)]/70) does not
            compute in Tailwind, and silently falls back to a black border. */}
        <div className="divide-y divide-[#eef0f4] px-5 py-5 [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
          <section>
            <SectionHeading detail={<SourceLink url={p.entity_source_url} />}>Ownership</SectionHeading>
            <div className="pt-1">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="min-w-0">
                  <div className="ub-eyebrow">Registered entity</div>
                  <div className="mt-1 truncate text-[15px] text-[var(--ink)]" title={p.llc_name ?? "Unknown LLC"}>
                    {p.llc_name ?? "Unknown LLC"}
                  </div>
                </div>
                <div className="grid h-7 w-7 place-items-center rounded-full bg-[var(--rw-hairline)] text-[var(--slate)]">→</div>
                <div className="min-w-0 text-right">
                  <div className="ub-eyebrow">Parent company</div>
                  <div className="mt-1 truncate text-sm font-semibold" title={p.parent ?? UNRESOLVED_PARENT} style={{ color: p.parent_color ?? undefined }}>
                    {p.parent ?? UNRESOLVED_PARENT}
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-4 text-[13px] text-[var(--slate)]">
                {p.resolved_by ? `Ownership resolved via ${p.resolved_by}` : "Parent company has not been resolved"}
              </div>
            </div>
          </section>

          {stage && (
            <section>
              <SectionHeading detail="Illustrative">Project Time Machine</SectionHeading>
              <StageClip stage={stage} asOf={fmtDate(asOf)} />
            </section>
          )}

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
            <div className="text-[13px] text-[var(--graphite)]">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--slate)]">Canonical site</span>
                <span className="truncate text-right font-medium text-[var(--graphite)]">{p.site_name ?? "Not linked"}</span>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <span className="text-[var(--slate)]">Lifecycle</span>
                <span className="text-right font-medium text-[var(--graphite)]">
                  {p.current_status?.replaceAll("_", " ") ?? "Unknown"}
                  {p.status_observed_at ? ` · observed ${fmtDate(p.status_observed_at)}` : ""}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <span className="text-[var(--slate)]">Location quality</span>
                <span className="text-right font-medium text-[var(--graphite)]">
                  {p.location_precision ?? "Unknown"}
                  {p.location_confidence != null ? ` · ${Math.round(p.location_confidence * 100)}% confidence` : ""}
                </span>
              </div>
            </div>
          </section>

          <section>
            <SectionHeading detail={scored ? `${satisfied} of ${factors.length} signals · ${p.score} pts` : "Not scored yet"}>Evidence signals</SectionHeading>
            <div className="overflow-hidden bg-white">
              {factors.map((factor, index) => {
                const ok = !!p.factors?.[factor.key];
                const event = ok ? evidenceFor(factor, events) : null;
                return (
                  <div
                    key={factor.key}
                    className={`grid grid-cols-[24px_1fr_auto] items-start gap-2.5 px-3 py-2.5 ${index ? "mt-1" : ""}`}
                  >
                    <span
                      className={`mt-px grid h-5 w-5 place-items-center rounded-full text-[13px] font-bold ${
                        ok ? "bg-[var(--rw-hairline)] text-[var(--ink)] ring-1 ring-inset ring-[var(--rw-hairline)]" : "bg-[var(--rw-hairline)] text-[var(--slate)]"
                      }`}
                    >
                      {ok ? "✓" : "–"}
                    </span>
                    <div className="min-w-0">
                      <div className={`text-xs leading-5 ${ok ? "font-medium text-[var(--graphite)]" : "text-[var(--slate)]"}`}>{factor.rule}</div>
                      {event?.source_url && <div className="mt-0.5 text-[12px]"><SourceLink url={event.source_url} label="View evidence" /></div>}
                    </div>
                    <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums ${ok ? "bg-[var(--rw-hairline)] text-[var(--ink)]" : "bg-white text-[var(--slate)]"}`}>
                      +{factor.points}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <SectionHeading>Score over time</SectionHeading>
            <div className="bg-white px-2 pb-1 pt-2 shadow-[0_1px_2px_rgb(15_23_42/0.03)]">
              <TimeMachine scores={data.scores} events={events} />
            </div>
          </section>

          <section>
            <SectionHeading detail={`${events.length} record${events.length === 1 ? "" : "s"}`}>Evidence history</SectionHeading>
            {events.length === 0 ? (
              <div className="px-4 py-6 text-center rw-meta">
                No evidence on or before this date.
              </div>
            ) : (
              <ol className="relative ml-2 border-l border-[var(--rw-hairline)]">
                {[...events].reverse().map((event, index) => (
                  <li key={`${event.ts}-${event.event_type}-${index}`} className="relative pb-4 pl-5 last:pb-0">
                    <span className="absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full border-2 border-white bg-[var(--slate)] ring-1 ring-[var(--rw-hairline)]" />
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-[13px] font-medium tabular-nums text-[var(--slate)]">{fmtDate(event.ts)}</span>
                        <span className="truncate rounded bg-[var(--rw-hairline)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--slate)]">
                          {event.source}
                        </span>
                      </div>
                      <span className="shrink-0 text-[12px]"><SourceLink url={event.source_url} /></span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--graphite)]">{describeEvent(event)}</p>
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
