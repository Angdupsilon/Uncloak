"use client";
// Linked list + map. The list is the primary, keyboard-accessible view; selecting a row
// highlights its marker, and clicking a marker selects (and scrolls to) its row.
import Link from "next/link";
import { useState } from "react";
import { fmtDate, fmtMW, fmtUSD } from "@/lib/format";
import { fmtDistance, KM_PER_MI } from "@/lib/geo";
import { orgHref, siteHref } from "@/lib/slug";
import type { NearbyResult, NearbySite } from "@/lib/types";
import SiteMapLazy from "./SiteMapLazy";
import { TierBadge } from "./ui";

function whatItIs(s: NearbySite): string {
  const bits: string[] = [];
  if (s.program) bits.push(`Registered as a ${s.program}${s.certified_at ? ` (${fmtDate(s.certified_at)})` : ""}`);
  else if (s.certified_at) bits.push(`State-registered data center (${fmtDate(s.certified_at)})`);
  if (s.tdlr_registrations) bits.push(`${s.tdlr_registrations} construction registration${s.tdlr_registrations === 1 ? "" : "s"}${s.total_cost != null ? `, ${fmtUSD(s.total_cost)}` : ""}`);
  if (s.mw_est != null) bits.push(`~${fmtMW(s.mw_est)} estimated`);
  return bits.join(" · ") || "Listed in public records; no cost or registration details";
}

export default function NearResults({ data }: { data: NearbyResult }) {
  const [sel, setSel] = useState<number | null>(null);
  const select = (id: number) => {
    setSel(id);
    document.getElementById(`near-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <div className="order-2 lg:order-1">
        <ol className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]" aria-label="Nearby sites, closest first">
          {data.sites.map((s, i) => (
            <li
              key={s.project_id}
              id={`near-${s.project_id}`}
              className={`scroll-mt-24 py-5 transition-colors ${sel === s.project_id ? "bg-[var(--canvas-softer)]" : ""}`}
            >
              <div className="flex items-start gap-4 px-1">
                <span className="w-6 pt-1 text-right text-[13px] tabular-nums text-[var(--slate)]">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <Link href={siteHref(s.project_id)} className="text-[17px] text-black hover:underline hover:underline-offset-4">
                      {s.name}
                    </Link>
                    <span className="text-[15px] tabular-nums text-black">
                      {fmtDistance(s.distance_km)} <span className="text-[var(--slate)]">{s.direction}</span>
                    </span>
                  </div>
                  <div className="rw-meta mt-1">
                    Facility · {[s.city, s.county && `${s.county} County`].filter(Boolean).join(", ") || "Location on map"} ·{" "}
                    {s.parent ? (
                      <Link href={orgHref(s.parent)} className="rw-link !font-medium">
                        {s.parent}
                      </Link>
                    ) : (
                      "Organization not linked"
                    )}
                  </div>
                  <p className="mt-2 text-[14px] leading-6 text-[var(--hairline-mid)]">{whatItIs(s)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <TierBadge tier={s.tier} />
                    <span className="rw-meta">Appears because it is {fmtDistance(s.distance_km)} from your search point, within {data.radius_mi} mi.</span>
                    <button type="button" onClick={() => setSel(s.project_id)} className="rw-meta underline underline-offset-2 hover:text-black" aria-pressed={sel === s.project_id}>
                      Show on map
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="order-1 lg:order-2">
        <div className="h-[360px] lg:sticky lg:top-6 lg:h-[560px]">
          <SiteMapLazy
            points={data.sites.map((s) => ({
              id: s.project_id,
              name: s.name,
              lat: s.lat!,
              lon: s.lon!,
              tier: s.tier,
              href: siteHref(s.project_id),
              caption: `${fmtDistance(s.distance_km)} ${s.direction}${s.parent ? ` · ${s.parent}` : ""}`,
            }))}
            center={data.center}
            radiusKm={data.radius_mi * KM_PER_MI}
            selectedId={sel}
            onSelect={select}
            label={`Map of ${data.sites.length} sites within ${data.radius_mi} miles of ${data.center.label}. The list presents the same sites.`}
          />
        </div>
      </div>
    </div>
  );
}
