"use client";
import { TIER_COLORS, TIER_LABELS, UNRESOLVED_PARENT } from "@/lib/constants";
import { describeEvent, fmtDate, fmtMW, fmtPct, fmtUSD, isLink } from "@/lib/format";
import { useJson } from "@/lib/useJson";
import type { EvidenceEvent, FactorConfig, Timeline } from "@/lib/types";
import TimeMachine from "./TimeMachine";

function SourceLink({ url }: { url: string | null | undefined }) {
  if (isLink(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-sky-700 underline decoration-dotted">
        source
      </a>
    );
  }
  return url ? <span className="text-slate-400">{url}</span> : <span className="text-slate-400">no link</span>;
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
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
        <div className="text-base font-medium text-slate-700">No project selected</div>
        Click a circle on the map to see who is behind it, why it scores the way it does, and how its evidence built up over time.
      </div>
    );
  }
  if (error && !data) return <div className="p-4 text-sm text-red-700">Could not load project: {error}</div>;
  if (!data || data.project.project_id !== projectId) {
    return <div className="p-4 text-sm text-slate-500">Loading project…</div>;
  }

  const p = data.project;
  const scored = p.probability != null;
  const events = data.events;

  return (
    <div className={`flex h-full flex-col overflow-y-auto transition-opacity ${loading ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{p.name}</div>
          <div className="text-xs text-slate-500">
            {[p.city, p.county && `${p.county} County`].filter(Boolean).join(", ") || "Location unknown"}
            {p.is_sample && <span className="ml-2 rounded bg-yellow-200 px-1.5 py-0.5 font-semibold text-yellow-900">SAMPLE</span>}
          </div>
        </div>
        <button onClick={onClose} className="rounded px-2 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
          ×
        </button>
      </div>

      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">Registered entity → parent</div>
        <div className="mt-1 text-lg font-semibold leading-snug text-slate-900">
          <span className="text-slate-600">{p.llc_name ?? "Unknown LLC"}</span>
          <span className="mx-2 text-slate-400">→</span>
          <span style={{ color: p.parent_color ?? undefined }}>{p.parent ?? UNRESOLVED_PARENT}</span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {p.resolved_by ? `Resolved via ${p.resolved_by}` : "Parent not resolved"} · <SourceLink url={p.entity_source_url} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-slate-100 px-4 py-3 text-center">
        <div>
          <div className="text-[11px] uppercase text-slate-500">Evidence score</div>
          <div className="text-lg font-semibold tabular-nums" style={{ color: scored ? TIER_COLORS[p.tier!] : undefined }}>
            {fmtPct(p.probability)}
          </div>
          {scored && <div className="text-[11px] text-slate-500">{TIER_LABELS[p.tier!]}</div>}
        </div>
        <div>
          <div className="text-[11px] uppercase text-slate-500">Est. load</div>
          <div className="text-lg font-semibold tabular-nums">{fmtMW(p.mw_est)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-slate-500">Registered cost</div>
          <div className="text-lg font-semibold tabular-nums">{fmtUSD(p.total_cost)}</div>
        </div>
      </div>

      <div className="border-b border-slate-100 px-4 py-3">
        <div className="mb-1 flex items-baseline justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist</div>
          <div className="text-[11px] text-slate-400">
            {scored ? `${p.score} pts · as of ${fmtDate(p.scored_at)}` : "not scored yet"}
          </div>
        </div>
        <ul className="space-y-1">
          {factors.map((f) => {
            const ok = !!p.factors?.[f.key];
            const ev = ok ? evidenceFor(f, events) : null;
            return (
              <li key={f.key} className="flex items-start gap-2 text-xs">
                <span className={`mt-px w-4 shrink-0 text-center font-bold ${ok ? "text-emerald-700" : "text-slate-300"}`}>{ok ? "✓" : "✗"}</span>
                <span className={`flex-1 ${ok ? "text-slate-800" : "text-slate-400"}`}>{f.rule}</span>
                <span className="shrink-0 tabular-nums text-slate-400">+{f.points}</span>
                <span className="w-12 shrink-0 text-right">{ev ? <SourceLink url={ev.source_url} /> : null}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-b border-slate-100 px-4 py-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Time Machine · evidence score over time</div>
        <TimeMachine scores={data.scores} events={events} />
      </div>

      <div className="px-4 py-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence ({events.length})</div>
        {events.length === 0 ? (
          <div className="text-xs text-slate-500">No evidence on or before this date.</div>
        ) : (
          <ul className="space-y-1.5">
            {[...events].reverse().map((e, i) => (
              <li key={`${e.ts}-${e.event_type}-${i}`} className="flex items-start gap-2 text-xs">
                <span className="w-20 shrink-0 tabular-nums text-slate-500">{fmtDate(e.ts)}</span>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-600">{e.source}</span>
                <span className="flex-1 text-slate-800">{describeEvent(e)}</span>
                <SourceLink url={e.source_url} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
