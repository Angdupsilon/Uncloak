"use client";
// Spare-capacity explorer: use filters, a ranked list, the map, and a slide-over plant card.
// The list is the accessible source of truth; the map repeats it.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import PlantCard from "@/components/public/PlantCard";
import { MapBoundary } from "@/components/public/SiteMapLazy";
import { Unavailable } from "@/components/public/ui";
import { fmtMW } from "@/lib/format";
import { TECH_COLORS, TECH_LABELS, USE_LABELS, fitsFor, type UseKey } from "@/lib/spare";
import type { Plant } from "@/lib/types";

// Leaflet touches `window`, so the map renders client-side only.
const PlantMap = dynamic(() => import("@/components/public/PlantMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-[#efefef]" aria-hidden />,
});

type Filter = "all" | UseKey;
const FILTERS: Filter[] = ["all", "battery", "data_center", "solar_storage"];

/** The MW figure the ranking sorts on for each filter; null when the plant has no output data. */
function rankMw(p: Plant, filter: Filter): number | null {
  if (filter === "all") return p.spare_p80_mw;
  return fitsFor(p).find((f) => f.use === filter)?.mw ?? null;
}

function landLabel(acres: number | null) {
  if (acres == null) return <Unavailable why="No parcel data for this plant" />;
  if (acres >= 100) return "Ample";
  if (acres >= 30) return "Some";
  return "Tight";
}

export default function SpareCapacityExplorer({ plants }: { plants: Plant[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // "All plants" lists every plant; those without output data sort last and read Unavailable.
  const ranked = useMemo(() => {
    const rows = filter === "all" ? [...plants] : plants.filter((p) => fitsFor(p).some((f) => f.use === filter));
    return rows.sort((a, b) => (rankMw(b, filter) ?? -1) - (rankMw(a, filter) ?? -1));
  }, [plants, filter]);
  const matchIds = useMemo(() => (filter === "all" ? null : new Set(ranked.map((p) => p.plant_id))), [filter, ranked]);

  const panelOpen = selectedId != null;
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelectedId(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelOpen]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter plants by use">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`h-9 rounded-full px-4 text-[14px] font-medium transition-colors ${
              filter === f ? "bg-black text-white" : "bg-[var(--canvas-soft)] text-black hover:bg-[#e2e5ea]"
            }`}
          >
            {f === "all" ? "All plants" : USE_LABELS[f]}
          </button>
        ))}
        <span className="rw-meta ml-1">
          {filter === "all" ? `${ranked.length} plants` : `${ranked.length} of ${plants.length} plants pass the ${USE_LABELS[filter].toLowerCase()} screen`}
        </span>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr]">
        <div className="max-h-[640px] overflow-y-auto rounded-lg border border-[var(--hairline)]">
          <table className="w-full table-fixed text-left text-[13px]">
            <caption className="sr-only">Plants ranked by spare connection capacity. Select a plant to open its details.</caption>
            <colgroup>
              <col className="w-9" />
              <col />
              <col className="w-[76px]" />
              <col className="w-[80px]" />
              <col className="w-[64px]" />
            </colgroup>
            <thead className="sticky top-0 bg-white text-[12px] text-[var(--slate)]">
              <tr className="border-b border-[var(--hairline)]">
                <th scope="col" className="py-2.5 pl-3 pr-1 font-medium">#</th>
                <th scope="col" className="px-1 py-2.5 font-medium">Plant</th>
                <th scope="col" className="px-1 py-2.5 text-right font-medium">Connection</th>
                <th scope="col" className="px-1 py-2.5 text-right font-medium">{filter === "all" ? "Free 80%" : "Fits"}</th>
                <th scope="col" className="py-2.5 pl-1 pr-3 text-right font-medium">Land</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((p, i) => {
                const v = rankMw(p, filter);
                const selected = p.plant_id === selectedId;
                return (
                  <tr key={p.plant_id} className={`border-b border-[var(--hairline)] last:border-0 ${selected ? "bg-[var(--canvas-softer)]" : "hover:bg-[#f7f8fa]"}`}>
                    <td className="py-2.5 pl-3 pr-1 tabular-nums text-[var(--stone)]">{i + 1}</td>
                    <td className="px-1 py-2.5">
                      <button
                        onClick={() => setSelectedId(p.plant_id)}
                        aria-pressed={selected}
                        className="block w-full truncate text-left font-medium text-black hover:underline hover:underline-offset-4"
                      >
                        {p.name}
                      </button>
                      <div className="flex items-center gap-1.5 text-[12px] text-[var(--slate)]">
                        <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: TECH_COLORS[p.technology] }} />
                        <span className="truncate">{TECH_LABELS[p.technology]}</span>
                      </div>
                    </td>
                    <td className="px-1 py-2.5 text-right tabular-nums">{fmtMW(p.connection_mw)}</td>
                    <td className="px-1 py-2.5 text-right font-medium tabular-nums">
                      {v == null ? <Unavailable why="No hourly output loaded for this plant" /> : fmtMW(v)}
                      {filter === "all" && v != null && p.technology === "solar" && <div className="text-[11px] font-normal text-[var(--stone)]">mostly night</div>}
                    </td>
                    <td className="py-2.5 pl-1 pr-3 text-right text-[var(--graphite)]">{landLabel(p.open_acres)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ranked.length === 0 && <p className="px-4 py-8 text-center text-[14px] text-[var(--graphite)]">No plants pass this screen.</p>}
        </div>

        <div className="relative h-[520px] overflow-hidden rounded-lg lg:h-[640px]">
          <MapBoundary>
            <PlantMap plants={plants} selectedId={selectedId} onSelect={setSelectedId} matchIds={matchIds} />
          </MapBoundary>
          <aside
            aria-label="Plant details"
            aria-hidden={!panelOpen}
            className={`absolute inset-y-0 right-0 z-[1200] w-[420px] max-w-full border-l border-[var(--hairline)] bg-white shadow-[var(--shadow-float)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              panelOpen ? "translate-x-0" : "pointer-events-none invisible translate-x-full"
            }`}
          >
            <PlantCard plantId={selectedId} onClose={() => setSelectedId(null)} />
          </aside>
        </div>
      </div>
    </div>
  );
}
