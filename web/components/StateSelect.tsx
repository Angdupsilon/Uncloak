"use client";
import { useMemo } from "react";
import { STATE_NAMES } from "@/lib/geo";
import type { Project } from "@/lib/types";

/** Map focus: the whole country or one state, listing only states that have sites on the map. */
export default function StateSelect({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string | null;
  onChange: (code: string | null) => void;
}) {
  const options = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) counts.set(p.state, (counts.get(p.state) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => (STATE_NAMES[a[0]] ?? a[0]).localeCompare(STATE_NAMES[b[0]] ?? b[0]));
  }, [projects]);

  return (
    <label className="flex shrink-0 items-center gap-2 text-[13px] text-[#5e5e5e]">
      <span className="font-medium text-black">Area</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 max-w-[220px] rounded-full border border-[#e2e2e2] bg-[#efefef] px-3 text-[14px] text-black transition-colors hover:bg-[#e2e2e2] focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
      >
        <option value="">All U.S. · {projects.length.toLocaleString()} sites</option>
        {options.map(([code, n]) => (
          <option key={code} value={code}>
            {STATE_NAMES[code] ?? code} · {n.toLocaleString()}
          </option>
        ))}
      </select>
    </label>
  );
}
