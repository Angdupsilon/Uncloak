"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TIER_ORDER } from "@/lib/constants";
import { fmtDate, fmtMW, fmtUSD } from "@/lib/format";
import { orgHref, siteHref } from "@/lib/slug";
import type { Site } from "@/lib/types";
import { TierBadge, Unavailable } from "./ui";

type Col = "name" | "place" | "parent" | "tier" | "cost" | "mw" | "first";

const TIER_RANK = (s: Site) => (s.tier ? TIER_ORDER.length - TIER_ORDER.indexOf(s.tier) : null);

const VALUE: Record<Col, (s: Site) => string | number | null> = {
  name: (s) => s.name.toLowerCase(),
  place: (s) => (s.city ?? s.county ?? "").toLowerCase() || null,
  parent: (s) => s.parent?.toLowerCase() ?? null,
  tier: TIER_RANK,
  cost: (s) => s.total_cost,
  mw: (s) => s.mw_est,
  first: (s) => (s.first_evidence ? Date.parse(s.first_evidence) : null),
};

/** Sortable site table. Missing values always sort last and read "Unavailable". */
export default function SitesTable({ sites, showOrg = false, caption }: { sites: Site[]; showOrg?: boolean; caption: string }) {
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 }>({ col: "cost", dir: -1 });

  const rows = useMemo(() => {
    const get = VALUE[sort.col];
    return [...sites].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return a.name.localeCompare(b.name);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir || a.name.localeCompare(b.name);
    });
  }, [sites, sort]);

  const cols: { col: Col; label: string; num?: boolean }[] = [
    { col: "name", label: "Site" },
    { col: "place", label: "Location" },
    ...(showOrg ? [{ col: "parent" as Col, label: "Organization" }] : []),
    { col: "tier", label: "Evidence" },
    { col: "cost", label: "Registered cost", num: true },
    { col: "mw", label: "Est. power (MW)", num: true },
    { col: "first", label: "First record", num: true },
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--hairline)] bg-white">
      <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
        <caption className="sr-only">{caption}. Column headers are buttons that sort the table.</caption>
        <thead className="bg-[var(--canvas-softer)] text-[12px] text-[var(--body)]">
          <tr>
            {cols.map((c) => {
              const on = sort.col === c.col;
              return (
                <th key={c.col} scope="col" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`px-4 py-2.5 font-medium ${c.num ? "text-right" : ""}`}>
                  <button
                    type="button"
                    onClick={() => setSort((s) => ({ col: c.col, dir: s.col === c.col ? ((-s.dir) as 1 | -1) : c.num || c.col === "tier" ? -1 : 1 }))}
                    className={`inline-flex items-center gap-1 hover:text-black ${on ? "text-black" : ""}`}
                  >
                    {c.label}
                    <span aria-hidden className="text-[10px]">{on ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--hairline)]">
          {rows.map((s) => (
            <tr key={s.project_id} className="hover:bg-[var(--canvas-softer)]">
              <th scope="row" className="max-w-[280px] px-4 py-3 font-medium">
                <Link href={siteHref(s.project_id)} className="text-black underline-offset-2 hover:underline">
                  {s.name}
                </Link>
                {s.is_sample && <span className="ml-2 text-[11px] font-semibold uppercase text-amber-700">Sample</span>}
              </th>
              <td className="px-4 py-3 text-[var(--hairline-mid)]">
                {[s.city, s.county && `${s.county} Co.`].filter(Boolean).join(", ") || <Unavailable why="No location published in these records" />}
              </td>
              {showOrg && (
                <td className="px-4 py-3">
                  {s.parent ? (
                    <Link href={orgHref(s.parent)} className="hover:underline">
                      {s.parent}
                    </Link>
                  ) : (
                    <span className="text-slate-500">Not linked</span>
                  )}
                </td>
              )}
              <td className="px-4 py-3">
                <TierBadge tier={s.tier} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{s.total_cost != null ? fmtUSD(s.total_cost) : <Unavailable why="No TDLR construction registration with a cost" />}</td>
              <td className="px-4 py-3 text-right tabular-nums">{s.mw_est != null ? (s.mw_est < 1 ? "<1" : fmtMW(s.mw_est).replace(" MW", "")) : <Unavailable why="Needs a registered construction cost" />}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[var(--hairline-mid)]">{s.first_evidence ? fmtDate(s.first_evidence) : <Unavailable />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
