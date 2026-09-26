"use client";
// Cinematic hero backdrop drawn from our own records: every site with a published or reviewed
// location, plotted on the Texas outline. Decorative (aria-hidden); the same count is stated
// in the caption and in "At a glance" below.
import { useEffect, useState } from "react";

const MIN_LON = -106.65;
const MAX_LON = -93.51;
const MIN_LAT = 25.84;
const MAX_LAT = 36.5;
const KX = Math.cos((31 * Math.PI) / 180); // equirectangular, corrected at Texas' middle latitude
const W = (MAX_LON - MIN_LON) * KX;
const H = MAX_LAT - MIN_LAT;

const px = (lon: number) => (lon - MIN_LON) * KX;
const py = (lat: number) => MAX_LAT - lat;

type Ring = [number, number][];

function toPath(rings: Ring[]): string {
  return rings.map((r) => `M${r.map(([lon, lat]) => `${px(lon).toFixed(3)},${py(lat).toFixed(3)}`).join("L")}Z`).join("");
}

export default function HeroVisual({ points }: { points: { lat: number; lon: number; mw: number | null }[] }) {
  const [outline, setOutline] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/tx_state.geojson")
      .then((r) => (r.ok ? r.json() : null))
      .then((tx) => {
        const g = tx?.geometry;
        if (!alive || !g) return;
        const rings: Ring[] = g.type === "MultiPolygon" ? g.coordinates.map((poly: Ring[]) => poly[0]) : [g.coordinates[0]];
        setOutline(toPath(rings));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl bg-black">
      {/* Diagonal light streak, echoing a long-exposure still. */}
      <div className="absolute -right-[20%] top-[-30%] h-[160%] w-[70%] rotate-[28deg] bg-[linear-gradient(90deg,transparent_0%,rgba(255,138,61,0.0)_30%,rgba(255,138,61,0.22)_48%,rgba(255,214,170,0.10)_52%,transparent_70%)] blur-2xl" />

      <svg
        viewBox={`-0.4 -0.4 ${W + 0.8} ${H + 0.8}`}
        className="absolute right-[-18%] top-1/2 h-[135%] w-auto -translate-y-1/2 sm:right-[-6%] lg:right-[2%]"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="hv-glow">
            <stop offset="0%" stopColor="#ffd9a8" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#ff8a3d" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff8a3d" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hv-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1c1c1c" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </linearGradient>
        </defs>
        {outline && <path d={outline} fill="url(#hv-fill)" stroke="rgba(255,255,255,0.28)" strokeWidth={0.035} strokeLinejoin="round" />}
        {points.map((p, i) => {
          const r = p.mw != null ? Math.min(0.9, 0.28 + Math.sqrt(p.mw) * 0.03) : 0.26;
          return <circle key={`g${i}`} cx={px(p.lon)} cy={py(p.lat)} r={r} fill="url(#hv-glow)" />;
        })}
        {points.map((p, i) => (
          <circle key={`d${i}`} cx={px(p.lon)} cy={py(p.lat)} r={0.045} fill="#fff" />
        ))}
      </svg>

      {/* Keep the copy legible: darken the left and bottom where the text sits. */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.72)_40%,rgba(0,0,0,0.1)_75%,transparent_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(0deg,rgba(0,0,0,0.75),transparent)]" />
    </div>
  );
}
