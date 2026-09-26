"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import AskGridSight from "@/components/AskGridSight";
import DateSlider from "@/components/DateSlider";
import HowScoring from "@/components/HowScoring";
import ParentFilter from "@/components/ParentFilter";
import ProjectPanel from "@/components/ProjectPanel";
import SummaryBar from "@/components/SummaryBar";
import { useJson } from "@/lib/useJson";
import type { AskResponse, ParentRow, Project, ScoringConfig, Summary } from "@/lib/types";

// Leaflet touches `window`, so the map renders client-side only.
const ProjectMap = dynamic(() => import("@/components/ProjectMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" />,
});

export default function Dashboard({ today }: { today: string }) {
  const [asOf, setAsOf] = useState(today);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeParents, setActiveParents] = useState<Set<string>>(new Set());
  const [highlight, setHighlight] = useState<number[] | null>(null);
  const [fitRequest, setFitRequest] = useState(0);

  const config = useJson<ScoringConfig>("/api/config");
  const summary = useJson<Summary>(`/api/summary?as_of=${asOf}`);
  const projects = useJson<{ as_of: string; projects: Project[] }>(`/api/projects?as_of=${asOf}`);
  const parents = useJson<{ parents: ParentRow[] }>(`/api/parents?as_of=${asOf}`);

  const projectList = useMemo(() => projects.data?.projects ?? [], [projects.data]);
  const showingSample = projectList.some((p) => p.is_sample);

  const toggleParent = useCallback((name: string) => {
    setActiveParents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const panelOpen = selectedId != null;

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelectedId(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  const onAsk = useCallback((r: AskResponse) => {
    if (r.map_filter) {
      setHighlight(r.map_filter.ids);
      if (r.map_filter.fit_bounds) setFitRequest((n) => n + 1);
    }
    if (r.open_timeline != null) setSelectedId(r.open_timeline);
  }, []);

  return (
    <div className="flex h-screen min-w-[1040px] flex-col gap-4 p-5 text-black">
      <header className="-mx-5 -mt-5 mb-1 flex items-center justify-between gap-6 bg-white px-5 py-4 shadow-[var(--shadow-topbar)]">
        <div className="min-w-0">
          
          <div className="min-w-0">
            <h1 className="ub-display-lg gs-wordmark">GridSight</h1>
            <p className="ub-body ub-body-md mt-1 truncate">
              Texas data-center load: requested vs. verified
            </p>
          </div>
        </div>
        <HowScoring config={config.data} />
      </header>

      {showingSample && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          <span className="rounded bg-amber-200/70 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Sample</span>
          <span>Names, dates, costs and ERCOT figures on screen are fake placeholders.</span>
        </div>
      )}

      <main className="flex min-h-0 flex-1 gap-4">
        {/* Summary rail. Stacking the four figures down the left gives the map
            the full column height instead of a squashed band under a header. */}
        <div className="flex w-[280px] shrink-0 flex-col">
          <SummaryBar summary={summary.data} loading={summary.loading} error={summary.error} />
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl bg-[#eaeaea] shadow-[var(--shadow-card)]">
          <ProjectMap
            projects={projectList}
            selectedId={selectedId}
            onSelect={setSelectedId}
            activeParents={activeParents}
            highlightIds={highlight}
            fitRequest={fitRequest}
            loading={projects.loading && !projects.data}
          />
          {projects.error && (
            <div className="absolute left-3 top-3 z-[1000] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 shadow-[var(--shadow-1)]">
              Projects unavailable: {projects.error}
            </div>
          )}
          {highlight && (
            <button
              onClick={() => setHighlight(null)}
              className="absolute left-14 top-3 z-[1000] flex items-center gap-2 rounded-full bg-teal-700 py-1.5 pl-3.5 pr-3 text-xs font-medium text-white shadow-[var(--shadow-2)] transition-colors hover:bg-teal-800"
            >
              Filtered to {highlight.length} project{highlight.length === 1 ? "" : "s"}
              <span aria-hidden className="text-sm leading-none text-teal-200">
                ×
              </span>
            </button>
          )}
          {/* Slide-over: the panel rides over the map instead of holding a
              permanent 400px column, so the map keeps the full width until a
              project is actually selected. Clipped by the map card's
              overflow-hidden, so it slides within the rounded surface. */}
          <aside
            aria-hidden={!panelOpen}
            className={`absolute inset-y-0 right-0 z-[1200] w-[420px] max-w-full border-l border-[#efefef] bg-white shadow-[var(--shadow-float)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              panelOpen ? "translate-x-0" : "pointer-events-none translate-x-full"
            }`}
          >
            <ProjectPanel projectId={selectedId} asOf={asOf} factors={config.data?.factors ?? []} onClose={() => setSelectedId(null)} />
          </aside>
        </div>
      </main>

      {/* pr-[420px] keeps the controls clear of the floating Ask launcher. */}
      <footer className="flex items-center gap-8 rounded-xl border border-[var(--border-soft)] bg-white px-5 py-3 pr-[420px] shadow-[var(--shadow-1)]">
        <DateSlider start={config.data?.backfill_start ?? null} end={today} value={asOf} onChange={setAsOf} />
        <div className="h-8 w-px shrink-0 bg-[var(--border-soft)]" />
        <div className="min-w-0 flex-1">
          <ParentFilter
            parents={parents.data?.parents ?? null}
            active={activeParents}
            onToggle={toggleParent}
            onClear={() => setActiveParents(new Set())}
            loading={parents.loading}
          />
        </div>
      </footer>

      <AskGridSight asOf={asOf} onResult={onAsk} />
    </div>
  );
}
