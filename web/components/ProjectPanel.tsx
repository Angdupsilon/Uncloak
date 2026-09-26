"use client";
import { TIER_COLORS, TIER_LABELS, UNRESOLVED_PARENT } from "@/lib/constants";
import { describeEvent, fmtDate, fmtMW, fmtPct, fmtUSD, isLink } from "@/lib/format";
import { useJson } from "@/lib/useJson";
import type { EvidenceEvent, FactorConfig, Timeline } from "@/lib/types";
import TimeMachine from "./TimeMachine";

function SourceLink({ url }: { url: string | null | undefined }) {
  if (isLink(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-black underline decoration-dotted underline-offset-2">
        source
      </a>
    );
  }
  return url ? <span className="text-[#afafaf]">{url}</span> : <span className="text-[#afafaf]">no link</span>;
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
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[#5e5e5e]">
        <div className="text-base font-medium text-black">No project selected</div>
        Click a circle on the map to see who is behind it, why it scores the way it does, and how its evidence built up over time.
      </div>
    );
  }
  if (error && !data) return <div className="p-4 text-sm text-black">Could not load project: {error}</div>;
  if (!data || data.project.project_id !== projectId) {
    return <div className="p-4 text-sm text-[#5e5e5e]">Loading project…</div>;
  }

  const p = data.project;
  const scored = p.probability != null;
  const events = data.events;

  return (
    <div className={`flex h-full flex-col overflow-y-auto transition-opacity ${loading ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2 border-b border-[#efefef] px-4 pb-3 pt-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-black">{p.name}</div>
          <div className="text-xs text-[#5e5e5e]">
            {[p.city, p.county && `${p.county} County`].filter(Boolean).join(", ") || "Location unknown"}
            {p.is_sample && <span className="ml-2 rounded-full bg-[#efefef] px-2 py-0.5 text-[11px] font-medium text-black">Sample</span>}
          </div>
        </div>
        <button onClick={onClose} className="rounded px-2 text-lg leading-none text-[#afafaf] hover:bg-[#efefef] hover:text-black" aria-label="Close">
          ×
        </button>
      </div>

      <div className="border-b border-[#efefef] px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-[#5e5e5e]">Registered entity → parent</div>
        <div className="mt-1 text-lg font-semibold leading-snug text-black">
          <span className="text-[#5e5e5e]">{p.llc_name ?? "Unknown LLC"}</span>
          <span className="mx-2 text-[#afafaf]">→</span>
          <span style={{ color: p.parent_color ?? undefined }}>{p.parent ?? UNRESOLVED_PARENT}</span>
        </div>
        <div className="mt-1 text-xs text-[#5e5e5e]">
          {p.resolved_by ? `Resolved via ${p.resolved_by}` : "Parent not resolved"} · <SourceLink url={p.entity_source_url} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-[#efefef] px-4 py-3 text-center">
        <div>
          <div className="text-[11px] uppercase text-[#5e5e5e]">Evidence score</div>
          <div className="text-lg font-semibold tabular-nums" style={{ color: scored ? TIER_COLORS[p.tier!] : undefined }}>
            {fmtPct(p.probability)}
          </div>
          {scored && <div className="text-[11px] text-[#5e5e5e]">{TIER_LABELS[p.tier!]}</div>}
        </div>
        <div>
          <div className="text-[11px] uppercase text-[#5e5e5e]">Est. load</div>
          <div className="text-lg font-semibold tabular-nums">{fmtMW(p.mw_est)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-[#5e5e5e]">Registered cost</div>
          <div className="text-lg font-semibold tabular-nums">{fmtUSD(p.total_cost)}</div>
        </div>
      </div>

      <div className="border-b border-[#efefef] px-4 py-3">
        <div className="mb-1 flex items-baseline justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">Checklist</div>
          <div className="text-[11px] text-[#afafaf]">
            {scored ? `${p.score} pts · as of ${fmtDate(p.scored_at)}` : "not scored yet"}
          </div>
        </div>
        <ul className="space-y-1">
          {factors.map((f) => {
            const ok = !!p.factors?.[f.key];
            const ev = ok ? evidenceFor(f, events) : null;
            return (
              <li key={f.key} className="flex items-start gap-2 text-xs">
                <span className={`mt-px w-4 shrink-0 text-center font-bold ${ok ? "text-emerald-700" : "text-[#5e5e5e]"}`}>{ok ? "✓" : "✗"}</span>
                <span className={`flex-1 ${ok ? "text-black" : "text-[#afafaf]"}`}>{f.rule}</span>
                <span className="shrink-0 tabular-nums text-[#afafaf]">+{f.points}</span>
                <span className="w-12 shrink-0 text-right">{ev ? <SourceLink url={ev.source_url} /> : null}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-b border-[#efefef] px-4 py-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">Time Machine · evidence score over time</div>
        <TimeMachine scores={data.scores} events={events} />
      </div>

      <div className="px-4 py-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#5e5e5e]">Evidence ({events.length})</div>
        {events.length === 0 ? (
          <div className="text-xs text-[#5e5e5e]">No evidence on or before this date.</div>
        ) : (
          <ul className="space-y-1.5">
            {[...events].reverse().map((e, i) => (
              <li key={`${e.ts}-${e.event_type}-${i}`} className="flex items-start gap-2 text-xs">
                <span className="w-20 shrink-0 tabular-nums text-[#5e5e5e]">{fmtDate(e.ts)}</span>
                <span className="shrink-0 rounded bg-[#efefef] px-1.5 py-px text-[10px] font-semibold text-[#5e5e5e]">{e.source}</span>
                <span className="flex-1 text-black">{describeEvent(e)}</span>
                <SourceLink url={e.source_url} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
