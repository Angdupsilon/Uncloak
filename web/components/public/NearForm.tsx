"use client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { RADIUS_MI } from "@/lib/geo";
import LocateButton from "./LocateButton";

/** Location + radius form. Submitting updates the URL, so every result is linkable. */
export default function NearForm({ q, radius, lat, lon }: { q: string; radius: number; lat: number | null; lon: number | null }) {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState(q);
  const [r, setR] = useState(radius);

  const go = (nextR = r) => {
    const t = text.trim();
    if (t) router.push(`/near?q=${encodeURIComponent(t)}&radius=${nextR}`);
    else if (lat != null && lon != null) router.push(`/near?lat=${lat}&lon=${lon}&radius=${nextR}`);
  };

  return (
    <div className="space-y-3">
      <form
        role="search"
        aria-label="Find sites near a place"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-q`} className="mb-1 block text-[14px] text-black">
            City, county, ZIP code or street address in Texas
          </label>
          <input
            id={`${id}-q`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Abilene, 78725, or 1102 McKinzie Rd, Corpus Christi"
            autoComplete="off"
            className="w-full border-0 border-b border-[var(--rw-hairline-soft,#c9ccd1)] bg-transparent py-3 text-[17px] text-black outline-none placeholder:text-[#939393] focus:border-black"
          />
        </div>
        <div>
          <label htmlFor={`${id}-r`} className="mb-1 block text-[14px] text-black">
            Within
          </label>
          <select
            id={`${id}-r`}
            value={r}
            onChange={(e) => {
              const v = Number(e.target.value);
              setR(v);
              if (q || (lat != null && lon != null)) go(v);
            }}
            className="border-0 border-b border-[var(--rw-hairline-soft,#c9ccd1)] bg-transparent py-3 pr-6 text-[17px] text-black outline-none focus:border-black"
          >
            {RADIUS_MI.map((m) => (
              <option key={m} value={m}>
                {m} miles
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="ub-pill">
          Find sites
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <LocateButton radius={r} />
        <span className="rw-meta">Your location is used once for this search and isn&apos;t stored.</span>
      </div>
    </div>
  );
}
