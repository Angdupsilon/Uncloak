"use client";
// Map for the spare-capacity page. It repeats what the ranked list shows, so keyboard and
// screen-reader users lose nothing by skipping it.
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Tooltip, useMap, ZoomControl } from "react-leaflet";
import { TexasSpotlight, VectorBasemap } from "@/components/ProjectMap";
import { UI } from "@/lib/constants";
import { fmtMW } from "@/lib/format";
import { TECH_COLORS, TECH_LABELS, TECH_ORDER } from "@/lib/spare";
import type { Plant } from "@/lib/types";

/** Marker area tracks the MW free in 80% of hours. */
function radiusFor(mw: number | null): number {
  if (mw == null || mw <= 0) return UI.markerMinRadiusPx;
  return Math.min(UI.markerMaxRadiusPx, UI.markerMinRadiusPx + 0.9 * Math.sqrt(mw));
}

function FitTexas() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(UI.txBounds);
  }, [map]);
  return null;
}

function PanToSelected({ plants, selectedId }: { plants: Plant[]; selectedId: string | null }) {
  const map = useMap();
  useEffect(() => {
    const p = plants.find((x) => x.plant_id === selectedId);
    if (p?.lat != null && p.lon != null) map.panTo([p.lat, p.lon]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, map]);
  return null;
}

/** MapLibre's vector basemap needs WebGL2; without it the markers still render on a plain ground. */
function hasWebGL2(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

export interface PlantMapProps {
  plants: Plant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Plants that pass the active use filter; others are dimmed. null = no filter. */
  matchIds: Set<string> | null;
}

export default function PlantMap({ plants, selectedId, onSelect, matchIds }: PlantMapProps) {
  const [gl] = useState(hasWebGL2);
  const located = plants.filter((p) => p.lat != null && p.lon != null);
  // Bigger circles first so small ones stay clickable.
  const ordered = [...located].sort((a, b) => (b.spare_p80_mw ?? 0) - (a.spare_p80_mw ?? 0));

  return (
    <div role="region" aria-label="Map of plants by spare connection capacity" className="gs-map relative h-full w-full overflow-hidden rounded-lg bg-[#aad3df]">
      <MapContainer center={UI.txCenter} zoom={UI.txZoom} className="h-full w-full" zoomControl={false} scrollWheelZoom={false}>
        {gl && <VectorBasemap />}
        <TexasSpotlight />
        <ZoomControl position="topleft" />
        <FitTexas />
        <PanToSelected plants={plants} selectedId={selectedId} />
        {ordered.map((p) => {
          const dimmed = matchIds !== null && !matchIds.has(p.plant_id);
          const selected = p.plant_id === selectedId;
          const opacity = dimmed ? UI.dimmedOpacity : 1;
          return (
            <CircleMarker
              key={p.plant_id}
              center={[p.lat!, p.lon!]}
              radius={radiusFor(p.spare_p80_mw)}
              pathOptions={{
                color: selected ? "#000" : "#1f2937",
                weight: selected ? 3.5 : 1,
                opacity,
                fillColor: TECH_COLORS[p.technology],
                fillOpacity: opacity * 0.85,
              }}
              eventHandlers={{ click: () => onSelect(p.plant_id) }}
            >
              <Tooltip direction="top">
                <div className="text-xs">
                  <div className="font-semibold">{p.name}</div>
                  <div>
                    {TECH_LABELS[p.technology]} · {fmtMW(p.connection_mw)} connection
                  </div>
                  <div>{p.spare_p80_mw == null ? "Output unavailable" : `${fmtMW(p.spare_p80_mw)} free in 80% of hours`}</div>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="absolute bottom-3 left-3 z-[1000] w-[200px] rounded-lg border border-[var(--hairline)] bg-white px-4 py-3 text-[13px] text-[var(--graphite)]">
        <div className="font-medium text-black">Plant type</div>
        <ul className="mt-2 space-y-1">
          {TECH_ORDER.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TECH_COLORS[t] }} />
              {TECH_LABELS[t]}
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-[var(--hairline)] pt-2 text-[12px] leading-4 text-[var(--slate)]">Circle size: MW free in 80% of hours.</p>
      </div>
      {!gl && (
        <p className="absolute bottom-2 right-2 z-[1000] rounded bg-white/90 px-2 py-1 text-[11px] text-[#404040]">
          Street basemap unavailable in this browser (needs WebGL2). Plant positions are still accurate.
        </p>
      )}
    </div>
  );
}
