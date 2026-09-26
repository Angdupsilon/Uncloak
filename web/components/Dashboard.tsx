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
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl bg-[#efefef]" />,
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
    <div className="flex h-screen min-w-[1040px] flex-col gap-4 p-5 text-black">
      <header className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          
          <div className="min-w-0">
            <h1 className="ub-display-lg">GridSight</h1>
            <p className="ub-body ub-body-md mt-1 truncate">
              Texas data-center load: requested vs. verified
            </p>
          </div>
        </div>
        <HowScoring config={config.data} />
      </header>

      {showingSample && (
        <div className="ub-body-md flex items-center gap-3 rounded-2xl bg-[#efefef] px-5 py-3.5 text-black">
          <span className="ub-pill-subtle !py-1.5 !px-3.5 !text-[14px]">Sample data</span>
          <span className="ub-body">Names, dates, costs and ERCOT figures on screen are fake placeholders.</span>
        </div>
      )}

      <SummaryBar summary={summary.data} loading={summary.loading} error={summary.error} />

      <main className="flex min-h-0 flex-1 gap-4">
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
            <div className="ub-card ub-body-sm-strong absolute left-3 top-3 z-[1000] !rounded-full px-4 py-2.5 text-black">
              Projects unavailable: {projects.error}
            </div>
          )}
          {highlight && (
            <button
              onClick={() => setHighlight(null)}
              className="ub-pill absolute left-3 top-14 z-[1000] gap-2 shadow-[var(--shadow-float)]"
            >
              Filtered to {highlight.length} project{highlight.length === 1 ? "" : "s"}
              <span aria-hidden className="text-sm leading-none text-white/60">
                ×
              </span>
            </button>
          )}
        </div>
        <aside className="ub-card w-[400px] shrink-0 overflow-hidden">
          <ProjectPanel projectId={selectedId} asOf={asOf} factors={config.data?.factors ?? []} onClose={() => setSelectedId(null)} />
        </aside>
      </main>

      {/* pr-[420px] keeps the controls clear of the floating Ask launcher. */}
      <footer className="ub-card flex items-center gap-8 px-5 py-3.5 pr-[300px]">
        <DateSlider start={config.data?.backfill_start ?? null} end={today} value={asOf} onChange={setAsOf} />
        <div className="h-8 w-px shrink-0 bg-[var(--border-soft)]" />
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
