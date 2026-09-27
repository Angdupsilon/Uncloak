"use client";
// Home-page leaderboard: a share strip across all linked sites, then one ranked row per
// organization with a bar scaled to the leader. Hovering a row or its strip segment tints
// that row in the organization's own colour and fades the rest.
import Link from "next/link";
import { useState } from "react";

type Org = { name: string; slug: string; color: string | null; sites: number };

const FALLBACK = "#94a3b8";

export default function OrgRanking({ orgs, top = 8 }: { orgs: Org[]; top?: number }) {
  const [active, setActive] = useState<string | null>(null);

  const linked = orgs.filter((o) => o.sites > 0);
  const total = linked.reduce((a, o) => a + o.sites, 0);
  const shown = linked.slice(0, top);
  const other = total - shown.reduce((a, o) => a + o.sites, 0);
  const max = shown[0]?.sites ?? 0;
  if (!total) return null;

  // Standard competition ranking: tied counts share a rank and the next rank skips.
  const ranks = shown.map((o) => 1 + shown.filter((x) => x.sites > o.sites).length);
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  const hovered = shown.find((o) => o.slug === active);

  return (
    <div onMouseLeave={() => setActive(null)}>
      <div aria-hidden className="mb-2 flex items-baseline justify-between gap-4 text-[13px]">
        <span className="text-[var(--body)]">Share of all {total.toLocaleString()} sites linked to a company</span>
        {/* Touch screens can't hover, so the hint only shows where it works. */}
        <span className="hidden truncate text-slate-400 [@media(hover:hover)]:inline">
          {hovered ? `${hovered.name}: ${pct(hovered.sites)}` : "Hover a row"}
        </span>
      </div>
      <div aria-hidden className="mb-6 flex h-7 gap-0.5 overflow-hidden rounded-md">
        {shown.map((o) => (
          <div
            key={o.slug}
            title={`${o.name} ${pct(o.sites)}`}
            onMouseEnter={() => setActive(o.slug)}
            className="h-full transition-opacity duration-150"
            style={{ flexGrow: o.sites, background: o.color ?? FALLBACK, opacity: active && active !== o.slug ? 0.25 : 1 }}
          />
        ))}
        {other > 0 && (
          <div
            title={`Other organizations ${pct(other)}`}
            className="h-full bg-[var(--hairline)] transition-opacity duration-150"
            style={{ flexGrow: other, opacity: active ? 0.25 : 1 }}
          />
        )}
      </div>

      <ol className="space-y-0.5">
        {shown.map((o, i) => {
          const c = o.color ?? FALLBACK;
          const on = active === o.slug;
          return (
            <li key={o.slug}>
              <Link
                href={`/org/${o.slug}`}
                onMouseEnter={() => setActive(o.slug)}
                onFocus={() => setActive(o.slug)}
                onBlur={() => setActive(null)}
                className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-[10px] px-3 py-3 transition-[background-color,box-shadow] duration-150 focus-visible:outline-none sm:grid-cols-[1.25rem_minmax(0,13.5rem)_minmax(0,1fr)_auto]"
                style={
                  on
                    ? {
                        background: `color-mix(in srgb, ${c} 11%, transparent)`,
                        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 40%, transparent)`,
                      }
                    : undefined
                }
              >
                <span className="text-right text-[13px] tabular-nums text-slate-400">{ranks[i]}</span>
                <span className={`truncate text-[16px] text-black ${ranks[i] <= 3 ? "font-medium" : ""}`}>{o.name}</span>
                <span className="col-span-2 col-start-2 row-start-2 h-3.5 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  <span
                    className="block h-full origin-left rounded-r-[4px] transition-opacity duration-150 motion-safe:animate-[gs-bar-grow_700ms_cubic-bezier(.2,.8,.2,1)_both]"
                    style={{
                      width: `${(o.sites / max) * 100}%`,
                      background: c,
                      opacity: active && !on ? 0.35 : 1,
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                </span>
                <span className="col-start-3 row-start-1 whitespace-nowrap text-right tabular-nums sm:col-start-4">
                  <span className="text-[15px] font-medium text-black">{o.sites}</span>
                  <span className="sr-only"> site{o.sites === 1 ? "" : "s"},</span>
                  <span className="ml-1.5 text-[12px] text-slate-400">{pct(o.sites)}</span>
                  <span className="sr-only"> of linked sites</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
