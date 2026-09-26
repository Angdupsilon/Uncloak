import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import SpareCapacityMethod from "@/components/public/SpareCapacityMethod";
import { SourceLink } from "@/components/public/Source";
import { Container, ErrorState, KindBadge } from "@/components/public/ui";
import { query } from "@/lib/db";
import { getConfig, getSummary, todayUtc } from "@/lib/queries";
import { fmtDate, fmtGW, fmtUSD } from "@/lib/format";
import { METRICS, SOURCES, type MetricKind, type SourceKey } from "@/lib/metrics";
import { TIER_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Methodology · Uncloak" };

async function load(asOf: string) {
  try {
    const [config, stats, summary] = await Promise.all([
      getConfig(asOf),
      query<{ source: string; records: number; first: Date | null; last: Date | null; retrieved: string | null }>(
        `SELECT source, COUNT(*) AS records, MIN(ts) AS first, MAX(ts) AS last, MAX(payload->>'retrieved') AS retrieved
         FROM evidence_events GROUP BY source ORDER BY COUNT(*) DESC`,
      ),
      getSummary(asOf),
    ]);
    return { ok: true as const, config, stats, summary };
  } catch (err) {
    console.error("[gridsight methodology]", err);
    return { ok: false as const };
  }
}

const TOC = [
  ["sources", "Sources"],
  ["linking", "Linking sites to organizations"],
  ["kinds", "Documented, estimated, context"],
  ["scoring", "Evidence index"],
  ["mw", "Estimated power demand"],
  ["missing", "Missing data"],
  ["counting", "Avoiding double counting"],
  ["limits", "Coverage limits"],
  ["spare-capacity", "Spare connection capacity"],
  ["metrics", "Every metric, explained"],
] as const;

export default async function Methodology() {
  await connection();
  const data = await load(todayUtc());

  return (
    <>
      <SiteHeader />
      <main id="main">
        <Container className="py-12">
          <p className="ub-eyebrow">Methodology</p>
          <h1 className="rw-display-sm mt-3">How Uncloak works, and what it can&apos;t tell you</h1>
          <p className="rw-subtitle mt-5 max-w-3xl">
            Uncloak assembles Texas public records about data-center sites, links them to the organizations behind them, and shows what each record
            documents. This page explains every step and its limits.
          </p>

          <div className="mt-14 grid gap-12 lg:grid-cols-[220px_1fr]">
            <nav aria-label="On this page" className="lg:sticky lg:top-6 lg:self-start">
              <p className="text-[13px] font-medium uppercase tracking-[0.35px] text-[var(--slate)]">On this page</p>
              <ul className="mt-3 space-y-2 text-[14px]">
                {TOC.map(([id, label]) => (
                  <li key={id}>
                    <a href={`#${id}`} className="text-[var(--ink-soft)] hover:underline hover:underline-offset-4">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <article className="max-w-3xl space-y-16 text-[16px] leading-[1.6] text-[var(--graphite)] [&_h2]:text-black">
              {!data.ok && <ErrorState title="Live figures unavailable" />}

              <Section id="sources" title="Sources">
                <p>Every site, date and dollar figure comes from one of these public records. Each record on a site page links to its original filing.</p>
                <ul className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
                  {(Object.keys(SOURCES) as SourceKey[]).map((k) => {
                    const st = data.ok ? data.stats.find((x) => x.source === k) : undefined;
                    return (
                      <li key={k} className="py-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-black">{SOURCES[k].name}</span>
                          <SourceLink url={SOURCES[k].url} label="Visit source" />
                        </div>
                        <p className="mt-1 text-[14px]">{SOURCES[k].what}</p>
                        {st && (
                          <p className="rw-meta mt-1">
                            {st.records.toLocaleString()} evidence records linked in Uncloak, dated {fmtDate(st.first?.toISOString())} to {fmtDate(st.last?.toISOString())}
                            {st.retrieved && ` · snapshot retrieved ${fmtDate(st.retrieved)}`}
                          </p>
                        )}
                        {k === "ERCOT" && data.ok && <ErcotSnapshot summary={data.summary} />}
                      </li>
                    );
                  })}
                </ul>
              </Section>

              <Section id="linking" title="Linking sites to organizations">
                <p>
                  Data centers are usually registered under LLCs with unrelated names (&ldquo;Sharka LLC&rdquo;, &ldquo;Rowan Cinco LLC&rdquo;). A site is linked to an
                  organization only when a record names that organization as the site&apos;s occupant, operator, owner or tenant:
                </p>
                <ul className="list-disc space-y-1 pl-6">
                  <li>
                    <strong className="font-semibold text-black">Comptroller registry:</strong> the organization appears in the owner, occupant or operator fields.
                  </li>
                  <li>
                    <strong className="font-semibold text-black">TDLR tenant:</strong> the organization is the named tenant on a construction registration.
                  </li>
                  <li>
                    <strong className="font-semibold text-black">Manual review:</strong> a cited source links the entity to the organization.
                  </li>
                </ul>
                <p>
                  A big-company name alone is never enough to merge records. When the link can&apos;t be established, the site stays &ldquo;not linked&rdquo; rather than
                  being guessed. Each link shows the record that supports it.
                </p>
              </Section>

              <Section id="kinds" title="Documented, estimated, context">
                <p>Every number is labeled with what kind of statement it is.</p>
                <dl className="space-y-4">
                  {(
                    [
                      ["documented", "Copied or added up directly from a public record, like a registered construction cost or a certification date."],
                      ["derived", "Calculated by Uncloak from documented values, using the methods below. Useful for scale, never a measurement."],
                      ["context", "Background that helps interpret a finding, like statewide grid figures. Not a measurement of the organization or site you're viewing."],
                    ] as [MetricKind, string][]
                  ).map(([k, text]) => (
                    <div key={k} className="grid gap-2 sm:grid-cols-[150px_1fr]">
                      <dt>
                        <KindBadge kind={k} />
                      </dt>
                      <dd>{text}</dd>
                    </div>
                  ))}
                </dl>
                <p>
                  &ldquo;Why this might matter&rdquo; sections are always context. Uncloak doesn&apos;t estimate effects on anyone&apos;s bills, water, health or
                  reliability, and it doesn&apos;t claim that a site causes any local outcome.
                </p>
              </Section>

              <Section id="scoring" title="Evidence index">
                <p>
                  Each site gets a checklist score from the public-record signals below. The score measures how much evidence exists that a project is real and
                  advancing. It&apos;s <strong className="font-semibold text-black">uncalibrated</strong>, and it isn&apos;t a probability that anything will be built.
                </p>
                {data.ok && data.config.factors.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] border-y border-[var(--hairline)] text-left text-[15px]">
                      <caption className="sr-only">Evidence checklist</caption>
                      <thead className="text-[13px] text-[var(--slate)]">
                        <tr className="border-b border-[var(--hairline)]">
                          <th scope="col" className="py-2.5 pr-4 font-medium">Signal</th>
                          <th scope="col" className="py-2.5 text-right font-medium">Points</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--hairline)]">
                        {data.config.factors.map((f) => (
                          <tr key={f.key}>
                            <td className="py-2.5 pr-4">{f.rule}</td>
                            <td className="py-2.5 text-right tabular-nums text-black">{f.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p>
                  The index is points ÷ 100. Levels: {TIER_LABELS.verified} at {data.ok ? data.config.tier_thresholds.verified * 100 : 70}% or more,{" "}
                  {TIER_LABELS.likely} at {data.ok ? data.config.tier_thresholds.likely * 100 : 40}% or more, otherwise {TIER_LABELS.low}. A score dated D
                  uses only evidence dated on or before D, so history can be replayed week by week in the{" "}
                  <Link href="/dashboard" className="rw-link">advanced dashboard</Link>.
                  {data.ok && data.config.computed_at && <> Scores were last computed {fmtDate(data.config.computed_at)}.</>}
                </p>
              </Section>

              <Section id="mw" title="Estimated power demand">
                <p>
                  Public records rarely state a data center&apos;s power demand. For scale, Uncloak divides a site&apos;s total registered construction cost by an
                  industry benchmark for the all-in cost of building one megawatt of data-center capacity
                  {data.ok && data.config.mw_cost_per_mw_usd != null ? (
                    <>
                      , currently <strong className="font-semibold text-black">{fmtUSD(data.config.mw_cost_per_mw_usd)} per MW</strong>
                      {data.config.mw_cost_source === "SAMPLE placeholder"
                        ? " (a SAMPLE placeholder, not a researched value)"
                        : data.config.mw_cost_source && data.config.mw_cost_source !== "env"
                          ? ` (${data.config.mw_cost_source})`
                          : " (set by the site operator)"}
                    </>
                  ) : (
                    " (no benchmark is configured, so no estimates are shown)"
                  )}
                  .
                </p>
                <p>
                  The estimate exists only where a construction cost is registered. Actual demand can be much higher or lower, and the estimate isn&apos;t a requested,
                  contracted or measured load.
                </p>
              </Section>

              <Section id="missing" title="Missing data">
                <p>
                  When a record doesn&apos;t report a value, Uncloak shows <strong className="font-semibold text-black">Unavailable</strong>, never zero. Totals
                  add up only the sites that have a value and say how many that is (for example, &ldquo;across 3 of 14 sites&rdquo;). A site with no published
                  location is listed but not mapped, and nearby searches can&apos;t measure its distance.
                </p>
              </Section>

              <Section id="counting" title="Avoiding double counting">
                <p>
                  Each site belongs to exactly one registered entity, and each entity to at most one organization, so organization totals never count a site
                  twice. Construction records that clearly share a legal entity or site code with a registry site are merged into it. Plausible but unconfirmed
                  matches are kept as separate sites rather than merged on a guess. TDLR registrations at one site can overlap (for example, a renovation of an
                  already registered building), which is why summed costs and floor areas are labeled as sums of registrations.
                </p>
              </Section>

              <Section id="limits" title="Coverage limits">
                <ul className="list-disc space-y-2 pl-6">
                  <li>Texas only. Company headquarters, and facilities outside Texas, aren&apos;t in this dataset.</li>
                  <li>
                    The TDLR data comes from a keyword search for &ldquo;data center&rdquo;. Code-named projects whose filings don&apos;t use those words can be
                    missing.
                  </li>
                  <li>Not every site has a construction registration with a cost, so dollar and power figures cover only some sites.</li>
                  <li>
                    ERCOT&apos;s large-load queue covers all industries, not just data centers, and its scope has changed over time (for example, in-service
                    years counted).
                  </li>
                  <li>TDLR doesn&apos;t publish inspection dates. Inspections are dated when the status was observed.</li>
                </ul>
              </Section>

              <Section id="spare-capacity" title="Spare connection capacity">
                <SpareCapacityMethod />
              </Section>

              <Section id="metrics" title="Every metric, explained">
                <dl className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
                  {Object.entries(METRICS).map(([key, m]) => (
                    <div key={key} className="py-5">
                      <dt className="flex flex-wrap items-center gap-3">
                        <span className="text-[17px] text-black">{m.label}</span>
                        <KindBadge kind={m.kind} />
                        <span className="rw-meta">Unit: {m.unit}</span>
                      </dt>
                      <dd className="mt-2 space-y-1 text-[15px]">
                        <p>{m.meaning}</p>
                        <p>
                          <span className="text-black">Limits:</span> {m.caveat}
                        </p>
                        <p className="rw-meta">Source: {m.source}</p>
                      </dd>
                    </div>
                  ))}
                </dl>
              </Section>
            </article>
          </div>
        </Container>
      </main>
      <SiteFooter updated={data.ok && data.config.computed_at ? fmtDate(data.config.computed_at) : null} />
    </>
  );
}

function ErcotSnapshot({ summary }: { summary: Awaited<ReturnType<typeof getSummary>> }) {
  const queue = summary.ercot;
  if (!queue) return <p className="rw-meta mt-1">No ERCOT queue figure is available for the current dashboard date.</p>;
  return (
    <div className="mt-3 rounded-lg bg-[var(--canvas-soft)] px-3 py-2.5 text-[13px] leading-5 text-[var(--ink-soft)]">
      <p className="font-medium text-black">Latest figures used in this dashboard</p>
      <dl className="mt-1 grid gap-x-3 sm:grid-cols-[1fr_auto]">
        {queue.gw_requested != null && <SnapshotRow label="Large loads requesting connection" value={fmtGW(queue.gw_requested)} date={queue.ts} url={queue.source_url} />}
        {queue.gw_approved != null && <SnapshotRow label="Approved to energize" value={fmtGW(queue.gw_approved)} date={queue.approved_ts} url={queue.approved_source_url} />}
        {queue.gw_observed_peak != null && <SnapshotRow label="Observed energized peak" value={fmtGW(queue.gw_observed_peak)} date={queue.peak_ts} url={queue.peak_source_url} />}
      </dl>
      <p className="mt-2 text-[12px] leading-4 text-[var(--slate)]">These are statewide, aggregate figures—not site-level totals. They can come from different reports and dates, and the queue&apos;s planning horizon has changed over time.</p>
    </div>
  );
}

function SnapshotRow({ label, value, date, url }: { label: string; value: string; date: string | null; url: string | null }) {
  return (
    <div className="contents">
      <dt>{label}</dt>
      <dd className="text-right tabular-nums text-black">
        {value} {date && <SourceLink url={url} label={fmtDate(date)} className="ml-1 text-[12px]" />}
      </dd>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-8 space-y-4">
      <h2 id={`${id}-h`} className="rw-heading-md">
        {title}
      </h2>
      {children}
    </section>
  );
}
