"use client";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Tooltip, useMap } from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { latLngBounds } from "leaflet";
import maplibreGL from "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl } from "maplibre-gl";
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

/** Multiplier applied to every vector label's text-size. */
const LABEL_SCALE = 1.35;

/**
 * Scale a MapLibre text-size value.
 *
 * It cannot simply be wrapped in ["*", value, scale]: a "zoom" expression is
 * only legal as the direct input of a top-level "step"/"interpolate", so
 * nesting one inside a multiply is rejected by the style validator. Instead the
 * output stops are scaled in place and the expression's shape is preserved.
 */
function scaleTextSize<T>(value: T): T {
  if (typeof value === "number") return (value * LABEL_SCALE) as T;
  if (!Array.isArray(value)) return value;

  const out = [...value];
  const op = out[0];
  // ["interpolate", interpolation, input, stopIn, stopOut, ...] -> outputs at 4,6,8...
  // ["step", input, defaultOut, stopIn, stopOut, ...]           -> outputs at 2,4,6...
  const first = op === "interpolate" ? 4 : op === "step" ? 2 : -1;
  if (first < 0) return value;
  for (let i = first; i < out.length; i += 2) {
    if (typeof out[i] === "number") out[i] = (out[i] as number) * LABEL_SCALE;
  }
  return out as T;
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
          ? { color: "#000000", weight: 2, opacity: 0.85, fill: false }
          : { stroke: false, fillColor: "#ffffff", fillOpacity: 0.62 }
      }
    />
  );
}

/**
 * Vector basemap via MapLibre GL, bridged into Leaflet so every existing layer
 * (markers, spotlight mask, tooltips, fitBounds) keeps working untouched.
 *
 * Why vector: raster tiles are published at 256px, so on a HiDPI display they
 * are always upscaled 2x and there is no keyless @2x source (CARTO serves an
 * identical 2049-byte placeholder for @2x and 1x alike; Wikimedia 403s after
 * the first request). Vector tiles are rendered on the client at the device
 * pixel ratio, so they are sharp at any zoom and any DPI.
 *
 * OpenFreeMap's "liberty" style is free, keyless and OSM-derived, so the map
 * keeps the colourful look.
 */
function VectorBasemap() {
  const map = useMap();
  useEffect(() => {
    // MapLibre spawns a module worker via import.meta.url, which Turbopack does
    // not rewrite - it fails with "Worker failed to load". Serving the worker
    // (and the shared chunk it imports) from public/ sidesteps the bundler.
    setWorkerUrl("/maplibre-gl-worker.mjs");

    const layer = maplibreGL({ style: "https://tiles.openfreemap.org/styles/liberty" });
    layer.addTo(map);

    // Place labels ship small for a full-screen map; this dashboard shows the
    // whole state in a panel, so bump every symbol layer's text size.
    const gl = layer.getMaplibreMap();
    const enlarge = () => {
      for (const lyr of gl.getStyle()?.layers ?? []) {
        if (lyr.type !== "symbol") continue;
        const size = gl.getLayoutProperty(lyr.id, "text-size");
        if (size == null) continue;
        gl.setLayoutProperty(lyr.id, "text-size", scaleTextSize(size));
      }
    };
    if (gl.isStyleLoaded()) enlarge();
    else gl.once("styledata", enlarge);

    return () => {
      map.removeLayer(layer);
    };
  }, [map]);
  return null;
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
  return <GeoJSON data={data} style={{ color: "#000000", weight: 0.5, fill: false, opacity: 0.18 }} interactive={false} />;
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
    <div className="gs-map relative h-full w-full overflow-hidden bg-[#aad3df]">
      <MapContainer center={UI.txCenter} zoom={UI.txZoom} className="h-full w-full" preferCanvas={false} zoomControl={false} zoomSnap={1} zoomDelta={1}>
        <VectorBasemap />
        <TexasSpotlight />
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
                // Parent ownership is available in the project details and filters;
                // keeping markers un-stroked lets evidence tier remain the sole map
                // encoding, including when a project is selected.
                stroke: false,
                opacity,
                fillColor: TIER_COLORS_MAP[p.tier],
                fillOpacity: opacity * (selected ? 0.9 : 0.75),
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

      <div className="ub-card ub-body-sm absolute bottom-4 left-4 z-[1000] w-[228px] px-5 py-4 text-[#5e5e5e]">
        <div className="ub-body-md-strong mb-3 text-black">Evidence tier</div>
        <div className="space-y-1.5">
          {TIER_ORDER.map((t) => (
            <div key={t} className="flex items-center gap-2.5">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TIER_COLORS_MAP[t] }} />
              {TIER_LABELS[t]}
            </div>
          ))}
        </div>
        <div className="ub-caption mt-3 border-t border-[#efefef] pt-2.5 text-[#afafaf]">
          Each dot is one public-record project. Size reflects estimated MW (enlarged); color = evidence tier.
        </div>
        {unlocated > 0 && (
          <div className="ub-caption mt-1 font-medium text-[#5e5e5e]">
            {unlocated} of {projects.length} projects not shown (no coordinates)
          </div>
        )}
      </div>

      {loading && (
        <div className="absolute right-3 top-3 z-[1000] rounded bg-white/90 px-2 py-1 text-xs text-[#5e5e5e] shadow">Loading…</div>
      )}
      {!loading && projects.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
          <div className="rounded-md bg-white/95 px-4 py-3 text-sm text-[#5e5e5e] shadow">No projects with evidence on or before this date.</div>
        </div>
      )}
    </div>
  );
}
