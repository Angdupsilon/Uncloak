// Presentational building blocks for the public research pages. Server-safe (no hooks).
import Link from "next/link";
import type { ReactNode } from "react";
import { KIND_HELP, KIND_LABEL, METRICS, type MetricKey, type MetricKind } from "@/lib/metrics";
import { TIER_COLORS, TIER_LABELS, type Tier } from "@/lib/constants";

/** Page column: fills laptop and desktop screens, capping at 1536px of content on very wide monitors, with 16/32px gutters. */
export const PAGE_WIDTH = "mx-auto w-full max-w-[1600px] px-4 sm:px-8";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${PAGE_WIDTH} ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="ub-eyebrow">{children}</div>;
}

// Monochrome per DESIGN.md: the three kinds differ by fill and outline style, not hue,
// so they stay distinguishable in greyscale and for colour-blind readers.
const KIND_STYLE: Record<MetricKind, string> = {
  documented: "bg-black text-white ring-black",
  derived: "border border-dashed border-black bg-white text-black ring-transparent",
  modeled: "border border-dotted border-black bg-white text-black ring-transparent",
  context: "bg-[var(--canvas-soft)] text-[var(--hairline-mid)] ring-transparent",
};

/**
 * Says what kind of number this is: documented, Uncloak estimate, or context.
 * `stacked` moves a trailing parenthetical ("(modeled)") onto a second line, for narrow columns.
 */
export function KindBadge({ kind, stacked = false }: { kind: MetricKind; stacked?: boolean }) {
  const label = KIND_LABEL[kind];
  const split = stacked ? label.indexOf(" (") : -1;
  return (
    <span
      title={KIND_HELP[kind]}
      className={`inline-flex shrink-0 items-center whitespace-nowrap px-2 py-0.5 text-[11px] font-medium tracking-[0.2px] ring-1 ring-inset ${
        split < 0 ? "rounded-full" : "flex-col rounded-xl text-center leading-[14px]"
      } ${KIND_STYLE[kind]}`}
    >
      {split < 0 ? (
        label
      ) : (
        <>
          <span>{label.slice(0, split)}</span>
          <span>{label.slice(split + 1)}</span>
        </>
      )}
    </span>
  );
}

export function TierBadge({ tier }: { tier: Tier | null }) {
  if (!tier) return <span className="text-[13px] text-slate-500">Not scored</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-800">
      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_COLORS[tier] }} />
      {TIER_LABELS[tier]}
    </span>
  );
}

export function SampleBadge() {
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
      Sample data
    </span>
  );
}

/** Shown on any page with SAMPLE rows, so demonstration data is never mistaken for real records. */
export function SampleBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div role="note" className="border-b border-amber-200 bg-amber-50">
      <Container className="flex items-center gap-2.5 py-2.5 text-[13px] text-amber-900">
        <SampleBadge />
        <span>This page includes demonstration data. Names, dates, costs and figures marked Sample are fake placeholders.</span>
      </Container>
    </div>
  );
}

/** Used wherever a value is missing. Never render missing data as 0. */
export function Unavailable({ why = "Not reported in the records we have" }: { why?: string }) {
  return (
    <span className="text-slate-500" title={why}>
      Unavailable<span className="sr-only">: {why}</span>
    </span>
  );
}

/**
 * A headline number with its unit, period, source and plain-English meaning. The meaning and
 * caveat sit in a native <details>, so they work with the keyboard and without JavaScript.
 */
export function MetricTile({
  metric,
  value,
  detail,
  period,
  sources,
  unavailableWhy,
}: {
  metric: MetricKey;
  value: string | null;
  detail?: ReactNode;
  period?: string;
  sources?: ReactNode;
  unavailableWhy?: string;
}) {
  const m = METRICS[metric];
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-[var(--hairline)] bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-medium leading-5 text-[var(--ink)]">{m.label}</h3>
        <KindBadge kind={m.kind} />
      </div>
      <div className="mt-3 text-[32px] font-normal leading-9 tracking-[-0.9px] text-black">
        {value ?? <span className="text-[24px] text-[var(--stone,#939393)]">Unavailable</span>}
      </div>
      <div className="mt-1 text-[13px] leading-5 text-[var(--body)]">
        {value == null ? (unavailableWhy ?? "Not reported in the records we have. Shown as unavailable, not zero.") : detail}
      </div>
      <div className="mt-3 text-[12px] leading-5 text-slate-500">
        <span className="font-medium text-slate-600">Unit:</span> {m.unit}
        {period && (
          <>
            {" · "}
            <span className="font-medium text-slate-600">Period:</span> {period}
          </>
        )}
      </div>
      {sources && <div className="mt-1 text-[12px] leading-5 text-slate-500">{sources}</div>}
      <details className="group mt-3 border-t border-[var(--hairline)] pt-2.5 text-[13px] leading-5">
        <summary className="cursor-pointer select-none font-semibold text-black">
          What this means
        </summary>
        <div className="mt-2 space-y-2 text-slate-700">
          <p>{m.meaning}</p>
          <p>
            <span className="font-medium">Limits:</span> {m.caveat}
          </p>
          <p>
            <span className="font-medium">Source:</span> {m.source}
          </p>
        </div>
      </details>
    </div>
  );
}

export function SectionTitle({ id, children, aside }: { id?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <h2 id={id} className="ub-display-sm text-black">
        {children}
      </h2>
      {aside && <div className="text-[13px] text-[var(--body)]">{aside}</div>}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[13px] text-[var(--body)]">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-slate-300">/</span>}
            {it.href ? (
              <Link href={it.href} className="hover:text-black hover:underline">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-black">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-6 py-10 text-center">
      <div className="text-[15px] font-semibold text-slate-900">{title}</div>
      {children && <div className="mx-auto mt-2 max-w-prose text-[14px] leading-6 text-slate-600">{children}</div>}
    </div>
  );
}

export function ErrorState({ title = "We couldn't load this data", detail }: { title?: string; detail?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-6 py-6">
      <div className="text-[15px] font-semibold text-red-900">{title}</div>
      <p className="mt-1 text-[14px] leading-6 text-red-800">
        The database didn&apos;t respond. Nothing is shown rather than showing incomplete numbers. Try again in a moment.
      </p>
      {detail && <p className="mt-2 font-mono text-[12px] text-red-700">{detail}</p>}
    </div>
  );
}

/** Callout that keeps "why it might matter" visibly separate from documented facts. */
export function ContextNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--canvas-softer)] p-5 sm:p-6">
      <div className="mb-2 flex items-center gap-2">
        <KindBadge kind="context" />
        <span className="rw-meta">Background for interpretation, not a measured local impact</span>
      </div>
      <div className="space-y-3 text-[15px] leading-6 text-[var(--hairline-mid)]">{children}</div>
    </div>
  );
}

/**
 * Headline number for first-time visitors: huge value, a plain-language label, one short note.
 * Unit, period, source and caveats stay one click away in "What this means".
 */
export function BigStat({
  metric,
  value,
  label,
  note,
  period,
  sources,
}: {
  metric: MetricKey;
  value: string | null;
  label: string;
  note?: ReactNode;
  period?: string;
  sources?: ReactNode;
}) {
  const m = METRICS[metric];
  return (
    <div className="flex min-w-0 flex-col bg-white p-6 sm:p-8">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[15px] font-medium text-black">{label}</span>
        <KindBadge kind={m.kind} />
      </div>
      <div
        className={`mt-4 font-normal leading-none ${
          value == null
            ? "text-[36px] tracking-[-1px] text-[#939393] sm:text-[40px]"
            : value.length > 8
              ? // Words ("Low evidence") get a smaller size and may wrap; numbers never wrap.
                "text-[36px] leading-[1.05] tracking-[-1px] text-black sm:text-[40px]"
              : "whitespace-nowrap text-[48px] tracking-[-2px] text-black sm:text-[56px] 2xl:text-[64px]"
        }`}
      >
        {value ?? "Unavailable"}
      </div>
      {note && <p className="mt-3 text-[14px] leading-5 text-[var(--slate)]">{note}</p>}
      <details className="mt-auto pt-5 text-[13px] leading-5">
        <summary className="cursor-pointer select-none font-semibold text-black">What this means</summary>
        <div className="mt-2 space-y-1.5 text-[var(--hairline-mid)]">
          <p>{m.meaning}</p>
          <p>
            <span className="text-black">Limits:</span> {m.caveat}
          </p>
          <p className="text-[var(--slate)]">
            Unit: {m.unit}
            {period && ` · ${period}`}
          </p>
          {sources && <p>{sources}</p>}
        </div>
      </details>
    </div>
  );
}

export function StatBand({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}
