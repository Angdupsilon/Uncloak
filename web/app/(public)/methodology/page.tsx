import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import SpareCapacityMethod from "@/components/public/SpareCapacityMethod";
import { SourceLink } from "@/components/public/Source";
import { Container, ErrorState, KindBadge } from "@/components/public/ui";
import { query } from "@/lib/db";
import { getConfig, getEstimateMethods, getSummary, todayUtc } from "@/lib/queries";
import { fmtDate, fmtGW, fmtUSD } from "@/lib/format";
import { METRICS, REFERENCE_SOURCES, SOURCES, type MetricKind, type SourceKey } from "@/lib/metrics";
import { TIER_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Methodology · Uncloak" };

async function load(asOf: string) {
  try {
    const [config, models, stats, summary] = await Promise.all([
      getConfig(asOf),
      getEstimateMethods(),
      query<{ source: string; records: number; first: Date | null; last: Date | null; retrieved: string | null }>(
        `SELECT source, COUNT(*) AS records, MIN(ts) AS first, MAX(ts) AS last, MAX(payload->>'retrieved') AS retrieved
         FROM evidence_events GROUP BY source ORDER BY COUNT(*) DESC`,
      ),
      getSummary(asOf),
    ]);
    return { ok: true as const, config, models, stats, summary };
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
  ["floor-area-model", "Modeled IT load"],
  ["grid", "Grid operator tag"],
  ["missing", "Missing data"],
  ["counting", "Avoiding double counting"],
  ["limits", "Coverage limits"],
  ["spare-capacity", "Spare connection capacity"],
  ["illustrations", "Illustrations"],
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
            Uncloak assembles public records about data-center sites (deepest in Texas, with state registries and permits in Illinois, Minnesota, Indiana,
            Wisconsin and Virginia) and mapped data-center sites across the U.S., links them to the organizations behind them, and shows what each record
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
                <h3 className="text-[17px] font-medium text-black">Records and mapped sites</h3>
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
                <h3 className="pt-4 text-[17px] font-medium text-black">Grid, reference and lookup data</h3>
                <p className="text-[15px]">
                  These don&apos;t document a site. They give grid context, place a site on the map or the grid, or supply a benchmark for a derived value, and
                  add no evidence points.
                </p>
                <ul className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
                  {Object.values(REFERENCE_SOURCES).map((src) => (
                    <li key={src.short} className="py-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-black">{src.name}</span>
                        <SourceLink url={src.url} label="Visit source" />
                      </div>
                      <p className="mt-1 text-[14px]">{src.what}</p>
                    </li>
                  ))}
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
                    <strong className="font-semibold text-black">State incentive registries (Illinois, Minnesota, Indiana, Wisconsin):</strong> the registry&apos;s company text
                    names the organization, for example &ldquo;Digital Realty Trust, LP&rdquo;. Special-purpose LLCs whose names don&apos;t state a brand stay
                    unlinked. A registry record joins a mapped site only when the record states an address within 250 m of a site of the same organization;
                    otherwise it is its own site, and possible duplicates are listed for review, never merged.
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
                      ["modeled", "A statistical range from an Uncloak model, shown as low to high with the model's version and tested error. Never a record and never part of the evidence index."],
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

              <Section id="floor-area-model" title="Modeled IT load (floor area)">
                <p>
                  Where a site has no registered construction cost, Uncloak shows a modeled range for its IT load from its size. The model looks at Texas data
                  centers that have both a registered floor area and a construction cost, turns each cost into megawatts as above, and records the megawatts per
                  square foot. The 10th, 50th and 90th percentiles of that ratio, times a site&apos;s floor area, give the low, middle and high values.
                </p>
                {data.ok && data.models.length > 0 ? (
                  data.models.map((m) => {
                    const q = (m.params as { mw_per_100k_sqft?: { low: number; mid: number; high: number } }).mw_per_100k_sqft;
                    return (
                      <div key={`${m.method}-${m.method_version}`} className="rounded-lg border border-[var(--hairline)] bg-white p-4 text-[15px]">
                        <p className="text-black">
                          Version {m.method_version}, fitted {fmtDate(m.fitted_at)} on {m.validation.n} Texas data centers
                          {q ? `: ${q.low} / ${q.mid} / ${q.high} MW per 100,000 sq ft (10th / 50th / 90th percentile).` : "."}
                        </p>
                        <p className="mt-2">
                          Tested by leaving out each training site in turn and predicting it from the rest: the middle value was off by a median of{" "}
                          <strong className="font-semibold text-black">{m.validation.median_abs_pct_error}%</strong>, and{" "}
                          <strong className="font-semibold text-black">{m.validation.interval_coverage_pct}%</strong> of true values fell inside the{" "}
                          {m.validation.nominal_interval_pct}% range. {m.estimates.toLocaleString()} sites currently show this estimate.
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p>No model version is loaded.</p>
                )}
                <p>
                  Limits: the training megawatts are themselves derived from construction cost, so the model inherits that estimate&apos;s uncertainty. Outside
                  Texas the size comes from the mapped building footprint in the IM3 atlas, which is ground coverage, not floor area, so multi-storey buildings come
                  out low. The range is wide on purpose. It is labeled &ldquo;Uncloak estimate (modeled)&rdquo; everywhere, never replaces a documented or
                  cost-derived value, and never counts toward the evidence index.
                </p>
              </Section>

              <Section id="grid" title="Grid operator tag">
                <p>
                  Each located site shows the balancing authority (grid operator) that serves its county, from the U.S. Energy Information
                  Administration&apos;s Form EIA-861 service-territory table for 2024 (read through Catalyst Cooperative&apos;s PUDL mirror). The site&apos;s
                  county comes from its coordinates, using the 2010 Census county boundaries EIA-861 still uses, or from the county named in its record when
                  it has no coordinates. When the two disagree the site isn&apos;t tagged.
                </p>
                <p>
                  Where EIA-861 lists several balancing authorities for a county, the tag reads &ldquo;one of N&rdquo;: EIA-861 doesn&apos;t say which one
                  serves the site, so Uncloak doesn&apos;t pick one. The tag is a lookup that places a site on the grid. It isn&apos;t a measurement and adds
                  no evidence points. EIA-861 has no service territory for Puerto Rico, so sites there read &ldquo;not published here&rdquo;.
                </p>
                <p>
                  EIA-861 names a few counties only by a name they share with an independent city (Fairfax and Baltimore, for example). PUDL files those rows
                  under the city. For a site in the county, Uncloak matches those rows by county name and says so on the site.
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
                  <li>
                    Public records are deepest in Texas (Comptroller, TDLR, TCEQ, ERCOT). Illinois (DCEO Data Center Investment Program), Minnesota
                    (DEED qualified data centers), Indiana (IEDC exemption contracts) and Wisconsin (DOR certified data centers) add state incentive
                    registries. Virginia DEQ&apos;s data-center air-permit list is loaded, but a permit joins a mapped site only when the permit document
                    places the facility within 250 m of a site whose operator the permit names; the rest are held for review, so most Virginia sites don&apos;t
                    show a permit yet. Elsewhere, sites come from the IM3 Open Source Data Center Atlas, which maps data-center buildings from OpenStreetMap.
                    Those sites have a location, footprint and operator tag but no public record yet, so they score 0 on the evidence index. Each checklist
                    item says when its record type isn&apos;t published in a state, which is different from a record that was checked and found missing.
                    Company headquarters aren&apos;t in this dataset.
                  </li>
                  <li>
                    The atlas covers well-mapped buildings, not every data center, and has no sites in Alaska, Delaware, Hawaii, Rhode Island or Vermont.
                    In Texas, 14 atlas sites that may duplicate an existing registry project are held back for review.
                  </li>
                  <li>
                    ERCOT figures, found capacity and the weekly queue comparison cover Texas projects with public records only. Georgia Power and PJM load
                    reports are shown as published, with their own scope, and are never added to ERCOT or compared with site records.
                  </li>
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

              <Section id="illustrations" title="Illustrations">
                <p>
                  Some pages show a generated image of a construction stage: bare land, a graded site, steel going up, finished buildings. They are labeled{" "}
                  <strong className="font-semibold text-black">AI illustration</strong> wherever they appear.
                </p>
                <p className="mt-3">
                  One image per stage, generated once and reused across every site. Which one a site shows is decided by that site&apos;s own records, so it
                  changes as the evidence does, including when you move the date back.
                </p>
                <p className="mt-3">
                  They are not photographs of any site, never contribute to the evidence index, and no number here is derived from them. Prompt, model, date and
                  file hash for each are recorded in{" "}
                  <code className="rounded bg-[var(--canvas-soft)] px-1 py-0.5 text-[13px]">public/illustrations/manifest.json</code>.
                </p>
                <p className="mt-3">
                  One stage, <strong className="font-semibold text-black">energized</strong>, is never shown: no source here reports that a site has begun
                  drawing power. TDLR&apos;s &ldquo;project closed&rdquo; means a permit file was closed, not that the site is operating.
                </p>
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
      <p className="mt-2 text-[12px] leading-4 text-[var(--slate)]">These are statewide, aggregate figures, not site-level totals. They can come from different reports and dates, and the queue&apos;s planning horizon has changed over time.</p>
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
