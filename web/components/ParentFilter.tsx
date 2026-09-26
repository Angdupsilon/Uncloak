"use client";
import { fmtMW } from "@/lib/format";
import type { ParentRow } from "@/lib/types";

export default function ParentFilter({
  parents,
  active,
  onToggle,
  onClear,
  loading,
}: {
  parents: ParentRow[] | null;
  active: Set<string>;
  onToggle: (name: string) => void;
  onClear: () => void;
  loading: boolean;
}) {
  if (!parents) {
    return <div className="text-xs text-slate-400">{loading ? "Loading parents…" : "No parent data"}</div>;
  }
  if (!parents.length) return <div className="text-xs text-slate-400">No parents as of this date</div>;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-slate-500">Parent</span>
      <button
        onClick={onClear}
        className={`rounded-full border px-2.5 py-1 text-xs ${active.size === 0 ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
      >
        All
      </button>
      {parents.map((p) => {
        const on = active.has(p.name);
        return (
          <button
            key={p.name}
            onClick={() => onToggle(p.name)}
            title={`${p.projects} projects · ${fmtMW(p.mw_total)} total · ${fmtMW(p.mw_weighted)} evidence-weighted · ${fmtMW(p.mw_verified)} in verified projects`}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on ? "border-slate-900 bg-slate-100 font-semibold" : "border-slate-300 hover:bg-slate-50"}`}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-slate-300" style={{ background: p.color ?? "transparent" }} />
            {p.name}
            <span className="tabular-nums text-slate-400">{p.mw_weighted != null ? fmtMW(p.mw_weighted) : p.projects}</span>
          </button>
        );
      })}
    </div>
  );
}
