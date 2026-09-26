"use client";
// Compact map for profile and nearby pages. It repeats what the adjacent list or table
// already shows, so keyboard and screen-reader users lose nothing by skipping it.
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useState } from "react";
import { Circle, CircleMarker, MapContainer, Tooltip, useMap, ZoomControl } from "react-leaflet";
import { latLngBounds } from "leaflet";
import { useRouter } from "next/navigation";
import { TexasSpotlight, VectorBasemap } from "@/components/ProjectMap";
import { TIER_COLORS_MAP, UI } from "@/lib/constants";
import type { Tier } from "@/lib/constants";

export interface MapPoint {
  id: number;
  name: string;
  lat: number;
  lon: number;
  tier: Tier | null;
  href: string;
  caption?: string;
}

export interface SiteMapProps {
  points: MapPoint[];
  center?: { lat: number; lon: number; label: string } | null;
  radiusKm?: number | null;
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  label: string;
}

function Fit({ points, center, radiusKm }: Pick<SiteMapProps, "points" | "center" | "radiusKm">) {
  const map = useMap();
  const key = `${points.map((p) => p.id).join(",")}|${center?.lat},${center?.lon}|${radiusKm}`;
  useEffect(() => {
    const pts: [number, number][] = points.map((p) => [p.lat, p.lon]);
    if (center) pts.push([center.lat, center.lon]);
    if (center && radiusKm) {
      // Frame the whole search circle, not only the hits.
      const dLat = radiusKm / 111;
      const dLon = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));
      pts.push([center.lat + dLat, center.lon + dLon], [center.lat - dLat, center.lon - dLon]);
    }
    if (!pts.length) map.fitBounds(UI.txBounds);
    else if (pts.length === 1) map.setView(pts[0], 11);
    else map.fitBounds(latLngBounds(pts), { padding: [28, 28], maxZoom: 12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function FlyToSelected({ points, selectedId }: { points: MapPoint[]; selectedId: number | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    const p = points.find((x) => x.id === selectedId);
    if (p) map.panTo([p.lat, p.lon]);
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

export default function SiteMap({ points, center, radiusKm, selectedId, onSelect, label }: SiteMapProps) {
  const router = useRouter();
  const [gl] = useState(hasWebGL2);
  return (
    <div role="region" aria-label={label} className="gs-map relative h-full w-full overflow-hidden rounded-lg bg-[#aad3df]">
      <MapContainer center={UI.txCenter} zoom={UI.txZoom} className="h-full w-full" zoomControl={false} scrollWheelZoom={false}>
        {gl && <VectorBasemap />}
        <TexasSpotlight />
        <ZoomControl position="topright" />
        <Fit points={points} center={center} radiusKm={radiusKm} />
        <FlyToSelected points={points} selectedId={selectedId} />
        {center && radiusKm && (
          <Circle
            center={[center.lat, center.lon]}
            radius={radiusKm * 1000}
            interactive={false}
            pathOptions={{ color: "#000", weight: 1.5, dashArray: "4 4", fillOpacity: 0.04 }}
          />
        )}
        {center && (
          <CircleMarker center={[center.lat, center.lon]} radius={7} interactive={false} pathOptions={{ color: "#fff", weight: 3, fillColor: "#000", fillOpacity: 1 }}>
            <Tooltip permanent direction="top" offset={[0, -8]}>
              <span className="text-xs font-medium">{center.label.split(",")[0]}</span>
            </Tooltip>
          </CircleMarker>
        )}
        {points.map((p) => {
          const sel = p.id === selectedId;
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lon]}
              radius={sel ? 11 : 8}
              pathOptions={{
                color: sel ? "#000" : "#1f2937",
                weight: sel ? 3.5 : 1.5,
                fillColor: p.tier ? TIER_COLORS_MAP[p.tier] : "#94a3b8",
                fillOpacity: 0.9,
              }}
              eventHandlers={{ click: () => (onSelect ? onSelect(p.id) : router.push(p.href)) }}
            >
              <Tooltip direction="top">
                <div className="text-xs">
                  <div className="font-semibold">{p.name}</div>
                  {p.caption && <div>{p.caption}</div>}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {!gl && (
        <p className="absolute bottom-2 left-2 z-[1000] rounded bg-white/90 px-2 py-1 text-[11px] text-[#404040]">
          Street basemap unavailable in this browser (needs WebGL2). Site positions are still accurate.
        </p>
      )}
    </div>
  );
}
