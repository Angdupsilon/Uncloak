"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AskGridSight from "@/components/AskGridSight";
import DateSlider from "@/components/DateSlider";
import DashboardSearch from "@/components/DashboardSearch";
import ParentFilter from "@/components/ParentFilter";
import ProjectPanel from "@/components/ProjectPanel";
import StateSelect from "@/components/StateSelect";
import SummaryBar from "@/components/SummaryBar";
import { useJson } from "@/lib/useJson";
import type { AskResponse, ParentRow, Project, ScoringConfig, Summary } from "@/lib/types";

// Leaflet touches `window`, so the map renders client-side only.
const ProjectMap = dynamic(() => import("@/components/ProjectMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-[#efefef]" />,
});

export default function Dashboard({
  today,
  initialParent = null,
  initialSiteId = null,
  initialState = null,
  initialRecordsOnly = false,
  embedded = false,
}: {
  today: string;
  initialParent?: string | null;
  initialSiteId?: number | null;
  /** USPS code to focus the map on; null shows the whole country. */
  initialState?: string | null;
  /** Start with atlas-only sites (no public record yet) hidden. */
  initialRecordsOnly?: boolean;
  /** Rendered inside a public profile: no page header, no floating Ask launcher, fixed height. */
  embedded?: boolean;
}) {
  const [asOf, setAsOf] = useState(today);
  // Deep links from the public profile pages (/dashboard?parent=Google&site=12).
  const [selectedId, setSelectedId] = useState<number | null>(initialSiteId);
  const [activeParents, setActiveParents] = useState<Set<string>>(() => new Set(initialParent ? [initialParent] : []));
  const [highlight, setHighlight] = useState<number[] | null>(null);
  const [region, setRegion] = useState<string | null>(initialState);
  const [fitRequest, setFitRequest] = useState(0);
  const [recordsOnly, setRecordsOnly] = useState(initialRecordsOnly);

  const config = useJson<ScoringConfig>("/api/config");
  const summary = useJson<Summary>(`/api/summary?as_of=${asOf}`);
  const projects = useJson<{ as_of: string; projects: Project[] }>(`/api/projects?as_of=${asOf}`);
  const parents = useJson<{ parents: ParentRow[] }>(
    `/api/parents?as_of=${asOf}${region ? `&state=${region}` : ""}${recordsOnly ? "&records=1" : ""}`,
  );

  const loadedProjects = useMemo(() => projects.data?.projects ?? [], [projects.data]);
  // "Public-record sites only" hides atlas-only sites: those whose only evidence is the IM3 atlas mapping.
  const allProjects = useMemo(() => (recordsOnly ? loadedProjects.filter((p) => p.has_records) : loadedProjects), [loadedProjects, recordsOnly]);
  const projectList = useMemo(() => (region ? allProjects.filter((p) => p.state === region) : allProjects), [allProjects, region]);
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
    <>
    {/* Below 1024px the dashboard stacks (map, then summary, then controls) and the page scrolls. */}
    <div className={embedded ? "flex h-[780px] min-w-[1000px] flex-col text-black" : "flex min-h-svh flex-col text-black lg:h-screen lg:min-w-[1040px]"}>
      {!embedded && (
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#e2e2e2] bg-white px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="gs-wordmark shrink-0 text-[28px] font-bold leading-none tracking-[-1.1px] text-black" aria-label="Uncloak home">
            Uncloak
          </Link>
          <span className="hidden h-5 w-px bg-[#e2e2e2] sm:block" aria-hidden />
          <div className="hidden min-w-0 sm:block">
            <p className="text-[14px] font-medium leading-4 text-black">Advanced dashboard</p>
            <p className="truncate text-[12px] leading-4 text-[#5e5e5e]">U.S. data-center records · ERCOT load requested vs. verified</p>
          </div>
        </div>
        <nav aria-label="Dashboard navigation" className="flex shrink-0 items-center gap-1 text-[13px] font-medium">
          <DashboardSearch projects={projectList} loading={projects.loading} onSelect={setSelectedId} onSearch={(ids) => {
            setHighlight(ids);
            setSelectedId(null);
            setActiveParents(new Set());
            setFitRequest((n) => n + 1);
          }} />
          <Link href="/methodology#scoring" className="rounded-full bg-black px-3.5 py-2 text-white transition-colors hover:bg-[#282828]">
            Methodology
          </Link>
        </nav>
      </header>
      )}

      <div className={embedded ? "flex min-h-0 flex-1 flex-col gap-4" : "flex min-h-0 flex-1 flex-col gap-3 p-3 pb-20 sm:gap-4 sm:p-5 sm:pb-20 lg:pb-5"}>

      {showingSample && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          <span className="rounded bg-amber-200/70 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">Sample</span>
          <span>Names, dates, costs and ERCOT figures on screen are fake placeholders.</span>
        </div>
      )}

      <main className={embedded ? "flex min-h-0 flex-1 gap-4" : "flex min-h-0 flex-1 flex-col gap-3 sm:gap-4 lg:flex-row"}>
        {/* Summary rail: one reconciliation panel down the left, so the map
            keeps the full column height. */}
        <div className={embedded ? "flex w-[280px] shrink-0 flex-col" : "order-2 flex w-full shrink-0 flex-col lg:order-none lg:w-[280px]"}>
          <SummaryBar summary={summary.data} error={summary.error} region={region} />
        </div>

        <div
          className={`relative min-w-0 overflow-hidden rounded-2xl bg-[#eaeaea] shadow-[var(--shadow-card)] ${
            embedded ? "flex-1" : "order-1 h-[70svh] min-h-[420px] flex-none lg:order-none lg:h-auto lg:min-h-0 lg:flex-1"
          }`}
        >
          <ProjectMap
            projects={projectList}
            region={region}
            selectedId={selectedId}
            onSelect={setSelectedId}
            activeParents={activeParents}
            highlightIds={highlight}
            fitRequest={fitRequest}
            loading={projects.loading && !projects.data}
            cooperativeZoom={embedded}
          />
          {projects.error && (
            <div className="absolute left-3 top-3 z-[1000] rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-[#5e5e5e] shadow-[var(--shadow-card)]">
              Projects unavailable: {projects.error}
            </div>
          )}
          {highlight && (
            <button
              onClick={() => setHighlight(null)}
              className="absolute left-14 top-3 z-[1000] flex items-center gap-2 rounded-full bg-teal-700 py-1.5 pl-3.5 pr-3 text-xs font-medium text-white shadow-[var(--shadow-float)] transition-colors hover:bg-teal-800"
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
      <footer
        className={`flex rounded-xl border border-[#e2e2e2] bg-white shadow-[var(--shadow-card)] ${
          embedded ? "items-center gap-8 px-5 py-3" : "flex-col items-stretch gap-4 p-4 lg:flex-row lg:items-center lg:gap-8 lg:px-5 lg:py-3 lg:pr-[420px]"
        }`}
      >
        <DateSlider
          start={config.data?.backfill_start ?? null}
          end={today}
          value={asOf}
          loading={summary.loading || projects.loading || parents.loading}
          onChange={setAsOf}
        />
        <div className={`h-8 w-px shrink-0 bg-[var(--border-soft)] ${embedded ? "" : "hidden lg:block"}`} />
        <StateSelect
          projects={allProjects}
          value={region}
          onChange={(code) => {
            setRegion(code);
            setActiveParents(new Set());
            setHighlight(null);
          }}
        />
        <button
          type="button"
          role="switch"
          aria-checked={recordsOnly}
          onClick={() => {
            setRecordsOnly((v) => !v);
            setHighlight(null);
          }}
          title="Hide sites whose only record is the IM3 data-center atlas (OpenStreetMap) mapping"
          className="flex shrink-0 items-center gap-2 text-[13px] text-[#5e5e5e]"
        >
          <span
            aria-hidden
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${recordsOnly ? "bg-black" : "bg-[#d4d4d4]"}`}
          >
            <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${recordsOnly ? "translate-x-[18px]" : "translate-x-0.5"}`} />
          </span>
          <span className="text-left leading-4">
            <span className="block font-medium text-black">Public-record sites only</span>
            <span className="block text-[11px]">
              {recordsOnly
                ? `${allProjects.length.toLocaleString()} of ${loadedProjects.length.toLocaleString()} sites`
                : `${(loadedProjects.length - loadedProjects.filter((p) => p.has_records).length).toLocaleString()} atlas-only shown`}
            </span>
          </span>
        </button>
        <div className={`h-8 w-px shrink-0 bg-[var(--border-soft)] ${embedded ? "" : "hidden lg:block"}`} />
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

      {!embedded && <AskGridSight asOf={asOf} onResult={onAsk} />}
      </div>
    </div>
    </>
  );
}
