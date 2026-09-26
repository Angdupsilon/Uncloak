"use client";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
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

  const onAsk = useCallback((r: AskResponse) => {
    if (r.map_filter) {
      setHighlight(r.map_filter.ids);
      if (r.map_filter.fit_bounds) setFitRequest((n) => n + 1);
    }
    if (r.open_timeline != null) setSelectedId(r.open_timeline);
  }, []);

  return (
    <div className="flex h-screen min-w-[1024px] flex-col gap-3 bg-slate-50 p-3 text-slate-900">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-bold tracking-tight">GridSight</h1>
          <span className="text-sm text-slate-500">Texas data-center load: what ERCOT is asked for vs. what public records can find</span>
        </div>
        <HowScoring config={config.data} />
      </header>

      {showingSample && (
        <div className="rounded-md border border-yellow-300 bg-yellow-100 px-4 py-2 text-sm font-semibold text-yellow-900">
          Showing SAMPLE data. Names, dates, costs and ERCOT figures are fake placeholders.
        </div>
      )}

      <SummaryBar summary={summary.data} loading={summary.loading} error={summary.error} />

      <main className="flex min-h-0 flex-1 gap-3">
        <div className="relative min-w-0 flex-1">
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
            <div className="absolute left-3 top-3 z-[1000] rounded bg-red-50 px-3 py-2 text-xs text-red-700 shadow">Projects unavailable: {projects.error}</div>
          )}
          {highlight && (
            <button
              onClick={() => setHighlight(null)}
              className="absolute left-14 top-3 z-[1000] rounded-full bg-sky-700 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-sky-800"
            >
              Ask filter: {highlight.length} project(s) · clear ×
            </button>
          )}
        </div>
        <aside className="w-[400px] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <ProjectPanel projectId={selectedId} asOf={asOf} factors={config.data?.factors ?? []} onClose={() => setSelectedId(null)} />
        </aside>
      </main>

      <footer className="flex items-center gap-6 rounded-lg border border-slate-200 bg-white px-4 py-2 pr-48">
        <DateSlider start={config.data?.backfill_start ?? null} end={today} value={asOf} onChange={setAsOf} />
        <div className="max-w-[50%]">
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
