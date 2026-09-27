"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { UI } from "@/lib/constants";
import { fmtMW } from "@/lib/format";
import type { ParentRow } from "@/lib/types";

/** How many parents stay inline before the rest move behind "More". */
const INLINE_LIMIT = UI.parentChipsCollapsed;

function ParentPill({
  p,
  on,
  onToggle,
}: {
  p: ParentRow;
  on: boolean;
  onToggle: (name: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(p.name)}
      aria-pressed={on}
      title={`${p.projects} projects · ${fmtMW(p.mw_total)} total · ${fmtMW(p.mw_weighted)} evidence-weighted · ${fmtMW(p.mw_verified)} in verified projects`}
      className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[14px] leading-5 transition-colors ${
        on ? "bg-black font-medium text-white" : "bg-[#efefef] text-black hover:bg-[#e2e2e2]"
      }`}
    >
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: p.color ?? "transparent", outline: on ? "1px solid rgb(255 255 255 / 0.5)" : "1px solid #d4d4d4" }}
      />
      <span className="max-w-[140px] truncate">{p.name}</span>
      <span className={`tabular-nums ${on ? "text-white/60" : "text-[#afafaf]"}`}>
        {p.mw_weighted != null ? fmtMW(p.mw_weighted) : p.projects}
      </span>
    </button>
  );
}

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
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the overflow panel on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // getParents already sorts by evidence-weighted MW. Selected parents lead the
  // bar, then the top unselected ones fill it to N. Leading matters: the bar
  // clips on narrow layouts (the embedded org dashboard), so a selection placed
  // after the top N was cut off and read as hidden behind "More".
  const { inline, overflow } = useMemo(() => {
    const rows = parents ?? [];
    const selected = rows.filter((p) => active.has(p.name));
    const rest = rows.filter((p) => !active.has(p.name));
    const fill = rest.slice(0, Math.max(0, INLINE_LIMIT - selected.length));
    return { inline: [...selected, ...fill], overflow: rest.slice(fill.length) };
  }, [parents, active]);

  // The directory is a complete company picker, including the companies that
  // are already visible as pills in the bar. The overflow count below still
  // reflects only the companies hidden from the inline bar.
  const filtered = useMemo(() => {
    const directory = parents ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? directory.filter((p) => p.name.toLowerCase().includes(needle)) : directory;
  }, [parents, q]);

  if (!parents) {
    return <div className="text-[14px] text-[#afafaf]">{loading ? "Loading parents…" : "No parent data"}</div>;
  }
  if (!parents.length) return <div className="text-[14px] text-[#afafaf]">No parents as of this date</div>;

  return (
    <div ref={wrapRef} className="relative flex min-w-0 items-center gap-2">
      <button
        onClick={onClear}
        aria-pressed={active.size === 0}
        className={`shrink-0 rounded-full px-3 py-1.5 text-[14px] leading-5 transition-colors ${
          active.size === 0 ? "bg-black font-medium text-white" : "bg-[#efefef] text-black hover:bg-[#e2e2e2]"
        }`}
      >
        All
      </button>
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        {inline.map((p) => (
          <ParentPill key={p.name} p={p} on={active.has(p.name)} onToggle={onToggle} />
        ))}
      </div>

      {overflow.length > 0 && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="shrink-0 rounded-full bg-[#efefef] px-3 py-1.5 text-[14px] font-medium leading-5 text-black transition-colors hover:bg-[#e2e2e2]"
        >
          +{overflow.length} more
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="All parent companies"
          className="ub-card absolute bottom-full right-0 z-[1300] mb-3 w-[340px] overflow-hidden !shadow-[var(--shadow-float)]"
        >
          <div className="border-b border-[#efefef] p-3">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search companies"
              className="w-full rounded-full bg-[#efefef] px-4 py-2.5 text-[14px] leading-5 text-black outline-none placeholder:text-[#afafaf] focus:bg-[#e2e2e2]"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="px-2 py-6 text-center text-[14px] text-[#afafaf]">No companies match “{q}”.</div>
            ) : (
              filtered.map((p) => {
                const on = active.has(p.name);
                return (
                  <button
                    key={p.name}
                    onClick={() => onToggle(p.name)}
                    aria-pressed={on}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[#efefef]"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: p.color ?? "transparent", outline: "1px solid #d4d4d4" }}
                    />
                    <span className={`min-w-0 flex-1 truncate text-[14px] leading-5 ${on ? "font-medium text-black" : "text-black"}`}>
                      {p.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-[12px] text-[#afafaf]">
                      {p.mw_weighted != null ? fmtMW(p.mw_weighted) : `${p.projects}`}
                    </span>
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                        on ? "bg-black text-white" : "border border-[#e2e2e2]"
                      }`}
                    >
                      {on ? "✓" : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
