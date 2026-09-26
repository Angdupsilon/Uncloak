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
    return <div className="text-xs text-[#afafaf]">{loading ? "Loading parents…" : "No parent data"}</div>;
  }
  if (!parents.length) return <div className="text-xs text-[#afafaf]">No parents as of this date</div>;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-[#5e5e5e]">Parent</span>
      <button
        onClick={onClear}
        className={`rounded-full border px-2.5 py-1 text-xs ${active.size === 0 ? "border-black bg-black text-black" : "border-[#e2e2e2] text-[#5e5e5e] hover:bg-[#efefef]"}`}
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
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on ? "border-black bg-black font-medium text-white" : "border-[#e2e2e2] hover:bg-[#efefef]"}`}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-[#e2e2e2]" style={{ background: p.color ?? "transparent" }} />
            {p.name}
            <span className="tabular-nums text-[#afafaf]">{p.mw_weighted != null ? fmtMW(p.mw_weighted) : p.projects}</span>
          </button>
        );
      })}
    </div>
  );
}
