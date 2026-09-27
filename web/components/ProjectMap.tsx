"use client";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CircleMarker, GeoJSON, MapContainer, Tooltip, useMap } from "react-leaflet";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { latLngBounds } from "leaflet";
import maplibreGL from "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl } from "maplibre-gl";
import { TIER_COLORS_MAP, TIER_LABELS, TIER_ORDER, UI, UNRESOLVED_PARENT } from "@/lib/constants";
import { fmtMW, fmtPct } from "@/lib/format";
import type { Project } from "@/lib/types";

export interface MapProps {
  projects: Project[];
  /** USPS code of the state in focus, or null for the whole country. */
  region?: string | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  activeParents: Set<string>;
  highlightIds: number[] | null;
  fitRequest: number; // increments when the map should fit to highlightIds
  loading: boolean;
  /**
   * The map sits inside a scrolling page: a plain wheel/two-finger scroll moves
   * the page, and only Ctrl/Cmd + scroll (or a trackpad pinch) zooms the map.
   */
  cooperativeZoom?: boolean;
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

type StateFeature = Feature<Polygon | MultiPolygon, { code: string; name: string }>;

/** public/us_states.geojson (Census cartographic boundaries, simplified), loaded once per page. */
let statesPromise: Promise<StateFeature[]> | null = null;
export function loadStates(): Promise<StateFeature[]> {
  statesPromise ??= fetch("/us_states.geojson")
    .then((r) => (r.ok ? r.json() : { features: [] }))
    .then((j: FeatureCollection) => j.features as StateFeature[])
    .catch(() => []);
  return statesPromise;
}

const outerRings = (g: Polygon | MultiPolygon): number[][][] =>
  g.type === "MultiPolygon" ? g.coordinates.map((poly) => poly[0]) : [g.coordinates[0]];

/** [[minLat, minLon], [maxLat, maxLon]] of one state's outline. */
export function stateBounds(f: StateFeature): [[number, number], [number, number]] {
  let minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
  for (const ring of outerRings(f.geometry)) {
    for (const [lon, lat] of ring) {
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    }
  }
  return [[minLat, minLon], [maxLat, maxLon]];
}

/**
 * Spotlight mask: a world-sized polygon with the area in focus punched out as a hole,
 * drawn over the basemap. Everything outside recedes, so a wide panel that unavoidably
 * shows neighbours still reads as a map OF that state (or of the U.S. when `state` is null,
 * with every state outlined).
 */
export function StateSpotlight({ state = null }: { state?: string | null }) {
  const [mask, setMask] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    let alive = true;
    loadStates().then((all) => {
      if (!alive) return;
      const focus = state ? all.filter((f) => f.properties.code === state) : all;
      if (!focus.length) return setMask(null);
      const world = [
        [-180, -85],
        [180, -85],
        [180, 85],
        [-180, 85],
        [-180, -85],
      ];
      setMask({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...focus.flatMap((f) => outerRings(f.geometry))] } },
          ...focus.map((f) => ({ type: "Feature" as const, properties: { outline: true }, geometry: f.geometry })),
        ],
      } as FeatureCollection);
    });
    return () => {
      alive = false;
    };
  }, [state]);
  if (!mask) return null;
  return (
    <GeoJSON
      key={state ?? "US"}
      data={mask}
      interactive={false}
      style={(f) =>
        f?.properties?.outline
          ? { color: "#000000", weight: state ? 2 : 0.8, opacity: state ? 0.85 : 0.5, fill: false }
          : { stroke: false, fillColor: "#ffffff", fillOpacity: 0.62 }
      }
    />
  );
}

/** The spare-capacity finder still covers Texas only. */
export function TexasSpotlight() {
  return <StateSpotlight state="TX" />;
}

/** Frame the region in focus whenever it changes (and on mount, so framing adapts to the panel size). */
function FitRegion({ region }: { region: string | null }) {
  const map = useMap();
  useEffect(() => {
    let alive = true;
    if (!region) {
      map.fitBounds(UI.usBounds, { padding: [UI.fitPaddingPx / 2, UI.fitPaddingPx / 2] });
      return;
    }
    loadStates().then((all) => {
      const f = all.find((x) => x.properties.code === region);
      if (alive && f) map.fitBounds(stateBounds(f), { padding: [UI.fitPaddingPx, UI.fitPaddingPx], maxZoom: UI.fitMaxZoom });
    });
    return () => {
      alive = false;
    };
  }, [region, map]);
  return null;
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
export function VectorBasemap() {
  const map = useMap();
  useEffect(() => {
    // MapLibre spawns a module worker via import.meta.url, which Turbopack does
    // not rewrite - it fails with "Worker failed to load". Serving the worker
    // (and the shared chunk it imports) from public/ sidesteps the bundler.
    setWorkerUrl("/maplibre-gl-worker.mjs");

    // MapLibre throws without WebGL2 (old devices, locked-down or headless browsers), which
    // would take the whole page down. Skip the basemap; markers and outlines still render.
    let webgl2 = false;
    try {
      webgl2 = !!document.createElement("canvas").getContext("webgl2");
    } catch {}
    if (!webgl2) return;

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

/**
 * Cooperative wheel zoom. A capture listener on the map container stops
 * unmodified wheel events before Leaflet's own scroll-zoom handler sees them,
 * so they fall through to the page. Modified ones (Ctrl/Cmd + wheel, which is
 * also what browsers emit for a trackpad pinch) reach Leaflet and zoom as usual.
 */
function CooperativeWheel({ onBlocked }: { onBlocked: () => void }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      e.stopPropagation();
      onBlocked();
    };
    el.addEventListener("wheel", onWheel, { capture: true });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, [map, onBlocked]);
  return null;
}

const HINT_MS = 1400;

export default function ProjectMap({ projects, region = null, selectedId, onSelect, activeParents, highlightIds, fitRequest, loading, cooperativeZoom = false }: MapProps) {
  const [zoomHint, setZoomHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flashZoomHint = useCallback(() => {
    setZoomHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setZoomHint(false), HINT_MS);
  }, []);
  useEffect(() => () => clearTimeout(hintTimer.current), []);
  const zoomKey = useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );

  const [legendOpen, setLegendOpen] = useState(false);
  const highlight = useMemo(() => (highlightIds ? new Set(highlightIds) : null), [highlightIds]);
  const located = projects.filter((p) => p.lat != null && p.lon != null);
  const unlocated = projects.length - located.length;

  // Draw bigger circles first so small ones stay clickable.
  const ordered = [...located].sort((a, b) => (b.mw_est ?? 0) - (a.mw_est ?? 0));

  return (
    <div className="gs-map relative h-full w-full overflow-hidden bg-[#aad3df]">
      <MapContainer center={UI.usCenter} zoom={UI.usZoom} className="h-full w-full" preferCanvas={false} zoomControl={false} zoomSnap={1} zoomDelta={1}>
        {cooperativeZoom && <CooperativeWheel onBlocked={flashZoomHint} />}
        <VectorBasemap />
        <StateSpotlight state={region} />
        {region === "TX" && <Counties />}
        <FitRegion region={region} />
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
                // A higher base opacity makes stacked markers visibly deepen,
                // so co-located projects read as a denser cluster.
                fillOpacity: opacity * (selected ? 0.9 : 0.85),
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

      {/* Collapsible so it can be moved out of the way of markers in the south
          west. The card itself stays pointer-events-none so dragging across it
          still pans the map; only the toggle takes clicks. */}
      <div
        className={`ub-card pointer-events-none absolute bottom-4 left-4 z-[1000] text-[#5e5e5e] ${
          legendOpen ? "ub-body-sm w-[228px] px-5 py-4" : "px-3 py-2"
        }`}
      >
        <div className={`flex items-center gap-3 ${legendOpen ? "mb-3" : ""}`}>
          <div className={legendOpen ? "ub-body-md-strong text-black" : "ub-body-sm-strong text-black"}>Evidence tier</div>
          {!legendOpen && (
            <div className="flex items-center gap-1">
              {TIER_ORDER.map((t) => (
                <span
                  key={t}
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: TIER_COLORS_MAP[t] }}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setLegendOpen((o) => !o)}
            aria-expanded={legendOpen}
            aria-label={legendOpen ? "Minimise legend" : "Expand legend"}
            title={legendOpen ? "Minimise" : "Expand"}
            className="pointer-events-auto -mr-1 ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full text-[#afafaf] transition-colors hover:bg-[#efefef] hover:text-black"
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className={`h-3.5 w-3.5 transition-transform ${legendOpen ? "" : "rotate-180"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 10l4-4 4 4" />
            </svg>
          </button>
        </div>
        {legendOpen && (
          <>
            <div className="space-y-1.5">
              {TIER_ORDER.map((t) => (
                <div key={t} className="flex items-center gap-2.5">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TIER_COLORS_MAP[t] }} />
                  {TIER_LABELS[t]}
                </div>
              ))}
            </div>
            <div className="ub-caption mt-3 border-t border-[#efefef] pt-2.5 text-[#afafaf]">
              Each dot is one project from public records or the IM3 data-center atlas. Size reflects estimated MW (enlarged); color = evidence tier from the public records loaded for each state (deepest in Texas).
            </div>
            {unlocated > 0 && (
              <div className="ub-caption mt-1 font-medium text-[#5e5e5e]">
                {unlocated} of {projects.length} projects not shown (no coordinates)
              </div>
            )}
          </>
        )}
      </div>

      {cooperativeZoom && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-[1001] flex items-center justify-center bg-black/35 transition-opacity duration-300 ${
            zoomHint ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="ub-body-md-strong text-white">Use {zoomKey} + scroll or pinch to zoom the map</div>
        </div>
      )}

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
