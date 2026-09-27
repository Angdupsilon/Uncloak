"use client";

import { useMemo, useRef, useState } from "react";
import type { Project } from "@/lib/types";
import GrokVoice from "@/components/GrokVoice";

export default function DashboardSearch({ projects, loading, onSearch, onSelect }: {
  projects: Project[];
  loading: boolean;
  onSearch: (ids: number[] | null) => void;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return terms.length ? projects.filter((p) => {
      const text = [p.name, p.site_name, p.parent, p.llc_name, p.city, p.county].filter(Boolean).join(" ").toLowerCase();
      return terms.every((word) => text.includes(word));
    }) : [];
  }, [projects, query]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  const applyVoiceSearch = (value: string) => {
    setQuery(value);
    const terms = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const ids = terms.length ? projects.filter((project) => {
      const text = [project.name, project.site_name, project.parent, project.llc_name, project.city, project.county].filter(Boolean).join(" ").toLowerCase();
      return terms.every((word) => text.includes(word));
    }).map((project) => project.project_id) : null;
    onSearch(ids);
  };

  return (
    <div className="relative" onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
    }}>
      <button ref={trigger} type="button" aria-expanded={open} aria-controls="dashboard-search"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[#5e5e5e] transition-colors hover:bg-[#f3f3f3] hover:text-black">
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" />
        </svg>
        Search
      </button>
      {open && (
        <section id="dashboard-search" aria-label="Search dashboard" className="absolute right-0 top-full z-[2000] mt-3 w-[min(400px,calc(100vw-2rem))] rounded-2xl border border-[#e2e2e2] bg-white p-4 shadow-[var(--shadow-float)]">
          <form role="search" aria-label="Search dashboard records" onSubmit={(event) => {
            event.preventDefault();
            onSearch(words.length ? matches.map((p) => p.project_id) : null);
          }}>
            <label htmlFor="dashboard-search-input" className="mb-2 block text-[14px] text-black">Search this dashboard</label>
            <div className="flex items-center gap-2 rounded-full border border-[#d4d4d4] px-3 py-1 focus-within:border-slate-400">
              <input id="dashboard-search-input" autoFocus value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="Company, site, city or county"
                className="dashboard-search-input min-w-0 flex-1 bg-transparent py-2 text-[13px] text-black" />
              <GrokVoice onPartialTranscript={setQuery} onTranscript={applyVoiceSearch} className="!h-8 !w-8" />
              <button type="submit" disabled={loading} className="rounded-full bg-black px-3 py-2 text-white disabled:opacity-50">Search</button>
            </div>
          </form>
          <div aria-live="polite" className="mt-3 text-[12px] text-[#5e5e5e]">
            {loading ? "Loading records…" : words.length ? `${matches.length} matching project${matches.length === 1 ? "" : "s"}` : "Search the records shown for the selected date."}
          </div>
          {!!words.length && !loading && (
            <ul className="mt-2 max-h-64 overflow-y-auto divide-y divide-[#efefef]">
              {matches.map((project) => (
                <li key={project.project_id}>
                  <button type="button" className="w-full rounded-md px-2 py-3 text-left hover:bg-[#f3f3f3]" onClick={() => {
                    onSearch([project.project_id]); onSelect(project.project_id); close();
                  }}>
                    <span className="block text-[13px] text-black">{project.name}</span>
                    <span className="block text-[12px] text-[#5e5e5e]">{[project.parent, project.city, project.county && `${project.county} County`].filter(Boolean).join(" · ")}</span>
                    {(project.lat == null || project.lon == null) && <span className="block text-[11px] text-[#5e5e5e]">Location unavailable · Open record</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="mt-3 text-[12px] text-[#5e5e5e] underline" onClick={() => { setQuery(""); onSearch(null); }}>Clear search</button>
        </section>
      )}
    </div>
  );
}
