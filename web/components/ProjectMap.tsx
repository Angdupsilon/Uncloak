"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { latLngBounds } from "leaflet";
import { TIER_COLORS, TIER_LABELS, TIER_ORDER, UI, UNRESOLVED_PARENT } from "@/lib/constants";
import { fmtMW, fmtPct } from "@/lib/format";
import type { Project } from "@/lib/types";

export interface MapProps {
  projects: Project[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  activeParents: Set<string>;
  highlightIds: number[] | null;
  fitRequest: number; // increments when the map should fit to highlightIds
  loading: boolean;
}

function radiusFor(mw: number | null): number {
  if (mw == null || mw <= 0) return UI.markerMinRadiusPx;
  return Math.min(UI.markerMaxRadiusPx, UI.markerMinRadiusPx + UI.markerRadiusPerSqrtMw * Math.sqrt(mw));
}

function Counties() {
  const [data, setData] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    // public/tx_counties.geojson is supplied by the team; the map works without it.
    fetch("/tx_counties.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setData(j))
      .catch(() => {});
  }, []);
  if (!data) return null;
  return <GeoJSON data={data} style={{ color: "#64748b", weight: 0.6, fill: false, opacity: 0.6 }} interactive={false} />;
}

function FitBounds({ projects, ids, request }: { projects: Project[]; ids: number[] | null; request: number }) {
  const map = useMap();
  useEffect(() => {
    if (!request || !ids?.length) return;
    const pts = projects
      .filter((p) => ids.includes(p.project_id) && p.lat != null && p.lon != null)
      .map((p) => [p.lat!, p.lon!] as [number, number]);
    if (!pts.length) return;
    map.fitBounds(latLngBounds(pts), { padding: [UI.fitPaddingPx, UI.fitPaddingPx], maxZoom: UI.fitMaxZoom });
    // Only refit when a new request arrives, not on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, map]);
  return null;
}

export default function ProjectMap({ projects, selectedId, onSelect, activeParents, highlightIds, fitRequest, loading }: MapProps) {
  const highlight = useMemo(() => (highlightIds ? new Set(highlightIds) : null), [highlightIds]);
  const located = projects.filter((p) => p.lat != null && p.lon != null);
  const unlocated = projects.length - located.length;

  // Draw bigger circles first so small ones stay clickable.
  const ordered = [...located].sort((a, b) => (b.mw_est ?? 0) - (a.mw_est ?? 0));

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-slate-200">
      <MapContainer center={UI.txCenter} zoom={UI.txZoom} className="h-full w-full" preferCanvas={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Counties />
        <FitBounds projects={projects} ids={highlightIds} request={fitRequest} />
        {ordered.map((p) => {
          const parentKey = p.parent ?? UNRESOLVED_PARENT;
          const dimmed = (activeParents.size > 0 && !activeParents.has(parentKey)) || (highlight !== null && !highlight.has(p.project_id));
          const opacity = dimmed ? UI.dimmedOpacity : 1;
          const selected = p.project_id === selectedId;
          return (
            <CircleMarker
              key={p.project_id}
              center={[p.lat!, p.lon!]}
              radius={radiusFor(p.mw_est)}
              pathOptions={{
                color: selected ? "#0f172a" : (p.parent_color ?? "#475569"),
                weight: selected ? 4 : 2.5,
                opacity,
                fillColor: TIER_COLORS[p.tier],
                fillOpacity: opacity * 0.75,
              }}
              eventHandlers={{ click: () => onSelect(p.project_id) }}
            >
              <Tooltip direction="top">
                <div className="text-xs">
                  <div className="font-semibold">{p.name}</div>
                  <div>
                    {p.llc_name ?? "Unknown LLC"} → {p.parent ?? UNRESOLVED_PARENT}
                  </div>
                  <div>
                    Evidence score {fmtPct(p.probability)} · {fmtMW(p.mw_est)}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-md bg-white/95 px-3 py-2 text-xs shadow">
        <div className="mb-1 font-semibold text-slate-700">Evidence tier</div>
        {TIER_ORDER.map((t) => (
          <div key={t} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: TIER_COLORS[t] }} />
            {TIER_LABELS[t]}
          </div>
        ))}
        <div className="mt-1 text-slate-500">Size ∝ √MW · outline = parent</div>
        {unlocated > 0 && <div className="mt-1 text-amber-700">{unlocated} not shown (no coordinates)</div>}
      </div>

      {loading && (
        <div className="absolute right-3 top-3 z-[1000] rounded bg-white/90 px-2 py-1 text-xs text-slate-600 shadow">Loading…</div>
      )}
      {!loading && projects.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
          <div className="rounded-md bg-white/95 px-4 py-3 text-sm text-slate-600 shadow">No projects with evidence on or before this date.</div>
        </div>
      )}
    </div>
  );
}
