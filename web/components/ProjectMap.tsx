"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap, ZoomControl } from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { latLngBounds } from "leaflet";
import { TIER_COLORS_MAP, TIER_LABELS, TIER_ORDER, UI, UNRESOLVED_PARENT } from "@/lib/constants";
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

/**
 * Spotlight mask: a world-sized polygon with Texas punched out as a hole, drawn
 * over the basemap. Everything outside the state recedes, so a wide panel that
 * unavoidably shows Oklahoma and Chihuahua still reads as a map OF Texas.
 * Texas is close to square, so fitting it into a 3:2 panel always leaves
 * neighbours on screen; dimming them is what makes the subject obvious.
 */
function TexasSpotlight() {
  const [mask, setMask] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/tx_state.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((tx) => {
        if (!alive || !tx?.geometry) return;
        // Outer ring covers the whole world; each Texas ring becomes a hole.
        const world = [
          [-180, -85],
          [180, -85],
          [180, 85],
          [-180, 85],
          [-180, -85],
        ];
        const geom = tx.geometry;
        const holes: number[][][] =
          geom.type === "MultiPolygon" ? geom.coordinates.map((poly: number[][][]) => poly[0]) : [geom.coordinates[0]];
        setMask({
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...holes] } },
            { type: "Feature", properties: { outline: true }, geometry: geom },
          ],
        } as FeatureCollection);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!mask) return null;
  return (
    <GeoJSON
      data={mask}
      interactive={false}
      style={(f) =>
        f?.properties?.outline
          ? { color: "#000000", weight: 1.5, opacity: 0.75, fill: false }
          : { stroke: false, fillColor: "#ffffff", fillOpacity: 0.55 }
      }
    />
  );
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
  // Hairline county borders: present enough to read as a grid, faint enough
  // that the data markers stay the brightest thing on the canvas.
  return <GeoJSON data={data} style={{ color: "#000000", weight: 0.5, fill: false, opacity: 0.12 }} interactive={false} />;
}

/** Frames Texas once on mount. Fitting beats a fixed zoom because the map
 *  panel is fluid: the same zoom that frames the state at 1440px shows half of
 *  Mexico at 1920px. */
function FitTexas() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(latLngBounds(UI.txBounds), { padding: [6, 6], animate: false });
  }, [map]);
  return null;
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
    <div className="gs-map relative h-full w-full overflow-hidden bg-[#eaeaea]">
      <MapContainer center={UI.txCenter} zoom={UI.txZoom} className="h-full w-full" preferCanvas={false} zoomControl={false} zoomSnap={0.5} zoomDelta={0.5}>
        {/* Three stacked Esri layers, all keyless. Hillshade supplies terrain
            relief, the canvas supplies roads and landcover over it at partial
            opacity, and the reference layer supplies place names. The canvas
            alone was flat; the hillshade is what gives the map depth.
            NOTE: Esri orders tile paths {z}/{y}/{x}, not {z}/{x}/{y}.
            detectRetina pulls one zoom level deeper on HiDPI screens, which is
            what fixes the pixelation at fractional zooms. */}
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
          detectRetina
          className="gs-tiles-relief"
        />
        <TileLayer
          attribution='Tiles &copy; <a href="https://www.esri.com">Esri</a>'
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
          detectRetina
          opacity={0.9}
          className="gs-tiles-base"
        />
        <TileLayer
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
          detectRetina
          className="gs-tiles-labels"
        />
        <TexasSpotlight />
        <Counties />
        <FitTexas />
        <FitBounds projects={projects} ids={highlightIds} request={fitRequest} />
        {/* Halos are emitted first: Leaflet's SVG renderer paints in DOM order, so
            this pass sits behind every core marker below. */}
        {ordered.map((p) => {
          const parentKey = p.parent ?? UNRESOLVED_PARENT;
          const dimmed = (activeParents.size > 0 && !activeParents.has(parentKey)) || (highlight !== null && !highlight.has(p.project_id));
          if (dimmed) return null; // no glow on dimmed markers: cost without signal
          return (
            <CircleMarker
              key={`halo-${p.project_id}`}
              center={[p.lat!, p.lon!]}
              radius={radiusFor(p.mw_est) * UI.markerHaloScale}
              interactive={false}
              pathOptions={{
                stroke: false,
                fillColor: TIER_COLORS_MAP[p.tier],
                fillOpacity: p.project_id === selectedId ? 0.28 : 0.13,
                className: p.project_id === selectedId ? "gs-halo gs-halo--pulse" : "gs-halo",
              }}
            />
          );
        })}
        {ordered.map((p) => {
          const parentKey = p.parent ?? UNRESOLVED_PARENT;
          const dimmed = (activeParents.size > 0 && !activeParents.has(parentKey)) || (highlight !== null && !highlight.has(p.project_id));
          const opacity = dimmed ? UI.dimmedOpacity : 1;
          const selected = p.project_id === selectedId;
          const core = radiusFor(p.mw_est);
          const tint = TIER_COLORS_MAP[p.tier];

          return (
            <CircleMarker
              key={p.project_id}
              center={[p.lat!, p.lon!]}
              radius={core}
              // Two-layer beacon: the soft halo emitted in the pass above, and
              // the crisp high-contrast core here.
              pathOptions={{
                color: selected ? "#000000" : (p.parent_color ?? "#000000"),
                weight: selected ? 3 : 1.25,
                opacity: selected ? opacity : opacity * 0.9,
                fillColor: tint,
                fillOpacity: opacity * 0.85,
                className: selected ? "gs-marker gs-marker--selected" : "gs-marker",
              }}
              eventHandlers={{ click: () => onSelect(p.project_id) }}
            >
              <Tooltip direction="top" offset={[0, -core - 4]} className="gs-tooltip">
                <div className="ub-body-sm">
                  <div className="ub-body-sm-strong text-black">{p.name}</div>
                  <div className="text-[#5e5e5e]">
                    {p.llc_name ?? "Unknown LLC"} &rarr; {p.parent ?? UNRESOLVED_PARENT}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[#5e5e5e]">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: tint }} />
                    {fmtPct(p.probability)} evidence · {fmtMW(p.mw_est)}
                  </div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Vignette. Purely atmospheric, so it never intercepts pointer events. */}
      <div className="gs-vignette pointer-events-none absolute inset-0" />

      <div className="ub-card ub-body-sm pointer-events-none absolute bottom-4 left-4 z-[1000] px-5 py-4 text-[#5e5e5e]">
        <div className="ub-body-md-strong mb-3 text-black">Evidence tier</div>
        <div className="space-y-1.5">
          {TIER_ORDER.map((t) => (
            <div key={t} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: TIER_COLORS_MAP[t], boxShadow: `0 0 8px ${TIER_COLORS_MAP[t]}80` }}
              />
              {TIER_LABELS[t]}
            </div>
          ))}
        </div>
        <div className="ub-caption mt-3 border-t border-[#efefef] pt-2.5 text-[#afafaf]">Size &prop; &radic;MW · outline = parent</div>
        {unlocated > 0 && <div className="ub-caption mt-1 text-[#5e5e5e]">{unlocated} not shown (no coordinates)</div>}
      </div>

      {loading && (
        <div className="ub-card ub-body-sm-strong absolute right-3 top-3 z-[1000] flex items-center gap-2 !rounded-full px-4 py-2.5 text-black">
          <span className="gs-ping inline-block h-1.5 w-1.5 rounded-full bg-black" />
          Loading
        </div>
      )}
      {!loading && projects.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
          <div className="ub-card ub-body-md px-6 py-5 text-[#5e5e5e]">
            No projects with evidence on or before this date.
          </div>
        </div>
      )}
    </div>
  );
}
