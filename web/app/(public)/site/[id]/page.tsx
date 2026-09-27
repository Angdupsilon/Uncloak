import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import TimeMachine from "@/components/TimeMachine";
import StageClip from "@/components/StageClip";
import { stageFor } from "@/lib/stages";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import SiteMapLazy from "@/components/public/SiteMapLazy";
import { SourceLink } from "@/components/public/Source";
import {
  Breadcrumbs,
  Container,
  ContextNote,
  ErrorState,
  KindBadge,
  BigStat,
  StatBand,
  SampleBadge,
  SampleBanner,
  SectionTitle,
} from "@/components/public/ui";
import { getSiteProfile, type SiteProfile } from "@/lib/publicQueries";
import { getConfig, todayUtc } from "@/lib/queries";
import { describeEvent, fmtDate, fmtMW, fmtUSD } from "@/lib/format";
import { TIER_LABELS } from "@/lib/constants";
import { countyLabel, fmtDistance } from "@/lib/geo";
import { describeRegions, EIA861_URL } from "@/lib/regions";
import { coverageNote, factorCoverage, factorNote } from "@/lib/coverage";
import { backtestNote, estimateNote, fmtRange, itLoad } from "@/lib/estimates";
import { PROGRAM_HELP, RESOLVED_BY_LABEL, SOURCES, type SourceKey } from "@/lib/metrics";
import { orgHref, siteHref } from "@/lib/slug";
import type { FactorConfig } from "@/lib/types";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata(props: PageProps<"/site/[id]">): Promise<Metadata> {
  const id = parseId((await props.params).id);
  const prof = id ? await getSiteProfile(id, todayUtc()).catch(() => null) : null;
  return { title: prof ? `${prof.site.name} · Uncloak` : "Site · Uncloak" };
}

async function load(id: number, asOf: string) {
  try {
    const [profile, config] = await Promise.all([getSiteProfile(id, asOf), getConfig(asOf)]);
    return { ok: true as const, profile, factors: config.factors, computed: config.computed_at };
  } catch (err) {
    console.error("[gridsight site]", err);
    return { ok: false as const };
  }
}

export default async function SitePage(props: PageProps<"/site/[id]">) {
  await connection();
  const id = parseId((await props.params).id);
  if (!id) notFound();
  const asOf = todayUtc();
  const data = await load(id, asOf);
  if (data.ok && !data.profile) notFound();

  return (
    <>
      <SiteHeader />
      {data.ok && data.profile && <SampleBanner show={data.profile.site.is_sample} />}
      <main id="main">
        <Container className="py-8">{!data.ok || !data.profile ? <ErrorState /> : <SiteBody p={data.profile} factors={data.factors} asOf={asOf} />}</Container>
      </main>
      <SiteFooter updated={data.ok && data.computed ? fmtDate(data.computed) : null} />
    </>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function SiteBody({ p, factors, asOf }: { p: SiteProfile; factors: FactorConfig[]; asOf: string }) {
  const s = p.site;
  const events = p.timeline?.events ?? [];
  const scores = p.timeline?.scores ?? [];
  const siteFactors = (p.timeline?.project.factors ?? {}) as Record<string, boolean>;

  // Figures overlaid on the illustration. They come from the record, never the
  // picture, and each is available as text elsewhere on this page.
  const stageStats = [
    s.mw_est != null ? { label: "Estimated load", value: fmtMW(s.mw_est), estimated: true } : null,
    s.total_cost != null ? { label: "Registered cost", value: fmtUSD(s.total_cost) } : null,
    s.score != null ? { label: "Evidence", value: `${s.score} / 100` } : null,
  ].filter((x): x is { label: string; value: string; estimated?: boolean } => x !== null);

  // Same derivation the dashboard panel uses, from the as-of factors and the
  // TDLR status ladder, so both surfaces agree on where a site has got to.
  const stage = stageFor({
    factors: siteFactors,
    currentStatus: p.timeline?.project.current_status ?? null,
    hasAnyEvidence: (p.timeline?.events?.length ?? 0) > 0,
  });
  const located = s.lat != null && s.lon != null;
  const place = [s.city, s.county && countyLabel(s.county, s.state), s.state].filter(Boolean).join(", ");
  const asOfLabel = `As of ${fmtDate(asOf)}`;
  const certEvent = events.find((e) => e.event_type === "certified") ?? null;
  const certSource = certEvent?.source ?? null;
  // The owner / occupant / operator block is the Comptroller record's own layout.
  const cert = certSource === "COMPTROLLER" ? (p.certification as Record<string, string | null> | null) : null;
  const sourceKeys = s.sources.filter((k): k is SourceKey => k in SOURCES);
  const within10 = p.nearby.filter((x) => x.distance_km <= 16.09);
  const atlasOnly = s.sources.length > 0 && s.sources.every((x) => x === "OSM");
  // TDLR construction records exist only in Texas: elsewhere a blank is "not published here".
  const notHere = `No construction-record source loaded for ${s.state}`;
  const operatorTag = s.resolved_by === "OSM_OPERATOR";
  const entityName = s.llc_name?.replace(/ \(OSM operator\)$/, "") ?? null;
  const locationBasis = !located
    ? "Location unavailable: no address or reviewed location is published for this site in our records."
    : s.sources.includes("TDLR") && s.address
      ? "Address from the site's TDLR construction registration."
      : atlasOnly || p.timeline?.project.location_method === "osm_atlas"
        ? "Mapped building or campus centroid from the IM3 data-center atlas (OpenStreetMap), not a public-record address."
        : "Location from a reviewed public-record compilation (see Methodology).";
  const modeled = s.mw_est == null ? itLoad(p.timeline?.estimates) : null;
  const grid = describeRegions(p.timeline?.regions ?? [], s.state, p.timeline?.project.county_fips ?? null);
  const dashboardHref = `/dashboard?site=${s.project_id}${s.parent ? `&parent=${encodeURIComponent(s.parent)}` : ""}`;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Organizations", href: "/org" },
          s.parent ? { label: s.parent, href: orgHref(s.parent) } : { label: "Not linked to an organization" },
          { label: s.name },
        ]}
      />

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ub-eyebrow">Facility</span>
            <span className="rounded-full bg-[var(--canvas-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--hairline-mid)]">
              {atlasOnly ? "Mapped site, not a headquarters" : "From public records, not a headquarters"}
            </span>
            <span
              title={grid.detail}
              className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[11px] font-medium text-[var(--hairline-mid)]"
            >
              Grid operator: {grid.value}
            </span>
            {s.is_sample && <SampleBadge />}
          </div>
          <h1 className="rw-display-sm mt-3 text-black">{s.name}</h1>
          <p className="mt-3 text-[15px] text-[var(--body)]">{place || "Location not published"}</p>
          <p className="rw-subtitle mt-5">
            {s.name} is a data-center site{place ? ` in ${place}` : " whose location isn't published in our records"}.{" "}
            {s.parent ? (
              <>
                Records link it to{" "}
                <Link href={orgHref(s.parent)} className="rw-link">
                  {s.parent}
                </Link>{" "}
                {operatorTag ? (
                  <>
                    through the operator named on the mapped site in OpenStreetMap, <span className="font-medium text-black">{entityName}</span>.{" "}
                  </>
                ) : (
                  <>
                    through the registered entity <span className="font-medium text-black">{s.llc_name}</span>.{" "}
                  </>
                )}
              </>
            ) : atlasOnly ? (
              <>No operator is named on the mapped site. </>
            ) : (
              <>Its registered entity{s.llc_name ? ` (${s.llc_name})` : ""} hasn&apos;t been linked to a larger organization. </>
            )}
            {atlasOnly && (
              <>
                Its only record is a mapping in the IM3 data-center atlas{s.state === "TX" ? "; no Texas public record has been matched to it yet" : ""}.{" "}
              </>
            )}
            {s.certified_at && certSource === "COMPTROLLER" && (
              <>
                It entered the Texas Comptroller&apos;s {s.program ?? "data-center"} program on {fmtDate(s.certified_at)}
                {s.program && PROGRAM_HELP[s.program] ? `, ${PROGRAM_HELP[s.program]}` : ""}.{" "}
              </>
            )}
            {certEvent && certSource === "IL_DCEO" && (
              <>
                Illinois DCEO lists a {String(certEvent.payload?.mou_year ?? "")} memorandum of understanding for it under the state&apos;s Data Center
                Investment Program, which grants sales-tax exemptions.{" "}
              </>
            )}
            {certEvent && certSource === "IN_IEDC" && (
              <>
                The Indiana Economic Development Corporation signed a data-center sales-tax exemption contract for it on{" "}
                {fmtDate(String(certEvent.payload?.contract_date ?? certEvent.ts))}.{" "}
              </>
            )}
            {certEvent && certSource === "WI_DOR" && (
              <>
                Wisconsin certified it as a qualified data center on {fmtDate(certEvent.ts)}, making it eligible for the state&apos;s data-center sales and
                use tax exemption.{" "}
              </>
            )}
            {certEvent && certSource === "MN_DEED" && (
              <>
                Minnesota DEED lists it as a certified qualified data center (list dated {fmtDate(String(certEvent.payload?.list_date ?? certEvent.ts))}), eligible
                for the state&apos;s data-center sales-tax exemption. DEED doesn&apos;t publish the certification date.{" "}
              </>
            )}
            {s.tdlr_registrations > 0 && (
              <>
                TDLR lists {plural(s.tdlr_registrations, "construction registration")}
                {s.total_cost != null ? ` with estimated costs totaling ${fmtUSD(s.total_cost)}` : ""}.
              </>
            )}
          </p>
        </div>
        <Link href={dashboardHref} className="ub-pill-subtle !text-[14px]">
          Open in advanced dashboard
        </Link>
      </header>

      <section aria-labelledby="findings-h" className="mt-16">
        <h2 id="findings-h" className="sr-only">
          Key numbers
        </h2>
        <StatBand>
          <BigStat
            metric="registered_cost"
            label="Construction cost on file"
            value={s.total_cost != null ? fmtUSD(s.total_cost) : null}
            note={s.total_cost != null ? plural(s.tdlr_registrations, "TDLR registration") : s.state === "TX" ? "No cost registered" : notHere}
            period="Registrations filed to date"
            sources={<SourceLink url={SOURCES.TDLR.url} label="TDLR TABS" />}
          />
          <BigStat
            metric="square_footage"
            label="Floor area"
            value={s.sqft != null ? `${Math.round(s.sqft / 1000).toLocaleString()}k sq ft` : null}
            note={s.sqft != null ? `${Math.round(s.sqft).toLocaleString()} square feet` : s.state === "TX" ? "Not published" : notHere}
            period="Registrations filed to date"
            sources={<SourceLink url={SOURCES.TDLR.url} label="TDLR TABS" />}
          />
          {modeled ? (
            <BigStat
              metric="it_mw_modeled"
              label="Modeled IT load"
              value={fmtRange(modeled)}
              note={
                <>
                  {estimateNote(modeled)} {backtestNote(modeled)}
                </>
              }
              period={`Model ${modeled.method_version}, ${fmtDate(modeled.as_of)}`}
              sources={
                <Link href="/methodology#floor-area-model" className="rw-link">
                  How it&apos;s modeled
                </Link>
              }
            />
          ) : (
            <BigStat
              metric="mw_est"
              label="Estimated power demand"
              value={s.mw_est != null ? (s.mw_est < 1 ? "<1 MW" : fmtMW(s.mw_est)) : null}
              note={s.mw_est != null ? "From construction cost, not measured" : "Needs a construction cost"}
              period={asOfLabel}
              sources={
                <Link href="/methodology#mw" className="rw-link">
                  How it&apos;s estimated
                </Link>
              }
            />
          )}
          <BigStat
            metric="evidence"
            label="Evidence strength"
            value={s.tier ? TIER_LABELS[s.tier] : null}
            note={
              s.score != null
                ? `${s.score} of 100 checklist points${s.state === "TX" ? "" : " · most checklist items are Texas record types"}`
                : "Not scored yet"
            }
            period={s.scored_at ? `Scored ${fmtDate(s.scored_at)}` : asOfLabel}
            sources={
              <Link href="/methodology#scoring" className="rw-link">
                Scoring checklist
              </Link>
            }
          />
        </StatBand>
      </section>

      {stage && (
        <section aria-labelledby="stage-h" className="mt-16">
          <h2 id="stage-h" className="ub-display-sm mb-3 text-black">
            Project Time Machine
          </h2>
          <div className="max-w-[640px]">
            <StageClip
              stage={stage}
              asOf={asOf}
              stats={stageStats}
            />
          </div>
        </section>
      )}

      <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section aria-labelledby="matter-h">
          <h2 id="matter-h" className="ub-display-sm mb-3 text-black">
            Why this might matter to you
          </h2>
          <ContextNote>
            {located ? (
              <p>
                {within10.length > 0
                  ? `${plural(within10.length, "other recorded data-center site")} ${within10.length === 1 ? "is" : "are"} within 10 miles of this one. `
                  : "No other recorded data-center site is within 10 miles of this one. "}
                Clusters of large facilities are part of what local utilities and grid planners must serve. These records don&apos;t measure
                local effects on bills, water or reliability.
              </p>
            ) : (
              <p>
                Without a published location we can&apos;t say what&apos;s nearby. The records still document who is behind the site and what has been filed.
              </p>
            )}
            {s.certified_at && certSource === "COMPTROLLER" && (
              <p>
                Registration in the Comptroller program means the state lists this site as eligible for a data-center sales-tax exemption. The registry
                doesn&apos;t publish the value of any exemption.
              </p>
            )}
            {certEvent && certSource === "IN_IEDC" && certEvent.payload?.expected_investment_usd != null && (
              <p>
                The contract expects {fmtUSD(Number(certEvent.payload.expected_investment_usd))} of investment; IEDC reports{" "}
                {fmtUSD(Number(certEvent.payload.actual_investment_usd ?? 0))} made so far. These are the contract&apos;s figures, not a construction cost.
              </p>
            )}
            {certEvent && certSource === "IL_DCEO" && certEvent.payload?.investment_commitment_usd != null && (
              <p>
                The MOU commits {fmtUSD(Number(certEvent.payload.investment_commitment_usd))} of investment and{" "}
                {String(certEvent.payload.new_jobs ?? "an unstated number of")} new jobs. DCEO estimates the tax benefit at{" "}
                {fmtUSD(Number(certEvent.payload.est_tax_benefits_usd))} (6.25% of the commitment, DCEO&apos;s own estimate, not an amount received).
              </p>
            )}
            {located && (
              <p>
                <Link href={`/near?lat=${s.lat!.toFixed(4)}&lon=${s.lon!.toFixed(4)}&label=${encodeURIComponent(s.name)}`} className="rw-link">
                  See all recorded sites near here →
                </Link>
              </p>
            )}
          </ContextNote>
        </section>
        <section aria-labelledby="source-h">
          <h2 id="source-h" className="ub-display-sm mb-3 text-black">
            Where this information comes from
          </h2>
          <ul className="divide-y divide-[var(--hairline)] rounded-lg border border-[var(--hairline)] bg-white text-[14px] leading-6">
            {sourceKeys.map((k) => {
              const n = events.filter((e) => e.source === k).length;
              return (
                <li key={k} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                  <span>
                    <span className="font-medium text-black">{SOURCES[k].name}</span>
                    <span className="block text-[var(--body)]">{plural(n, "record")} for this site</span>
                  </span>
                  <SourceLink url={SOURCES[k].url} label="Original source" />
                </li>
              );
            })}
            <li className="p-4 text-[13px] text-[var(--body)]">
              {s.first_evidence ? `Records dated ${fmtDate(s.first_evidence)} to ${fmtDate(s.last_evidence)}. ` : "No dated records. "}
              Each record in the history below links to its original filing.
            </li>
          </ul>
        </section>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section aria-labelledby="loc-h">
          <SectionTitle id="loc-h">Location</SectionTitle>
          {located ? (
            <div className="h-[300px]">
              <SiteMapLazy
                points={[{ id: s.project_id, name: s.name, lat: s.lat!, lon: s.lon!, tier: s.tier, href: siteHref(s.project_id) }]}
                selectedId={s.project_id}
                label={`Map showing the location of ${s.name}`}
              />
            </div>
          ) : null}
          <dl className="mt-3 space-y-2 text-[14px]">
            {s.address && (
              <div>
                <dt className="text-[12px] text-[var(--body)]">Address</dt>
                <dd className="text-black">{s.address}</dd>
              </div>
            )}
            <div>
              <dt className="text-[12px] text-[var(--body)]">How we know</dt>
              <dd className="text-[var(--hairline-mid)]">{locationBasis}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[var(--body)]">Grid operator (balancing authority)</dt>
              <dd className="text-black">{grid.value}</dd>
              <dd className="text-[13px] text-[var(--hairline-mid)]">
                {grid.detail} A lookup by county, not a measurement of this site.{" "}
                <SourceLink url={EIA861_URL} label="EIA-861 service territories" />
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="own-h">
          <SectionTitle id="own-h">Who is behind it</SectionTitle>
          <ol className="space-y-3 text-[14px]">
            <li className="rounded-xl border border-[var(--hairline)] bg-white p-4">
              <div className="text-[12px] text-[var(--body)]">Registered entity on the records</div>
              <div className="font-medium text-black">{s.llc_name ?? "Not recorded"}</div>
            </li>
            <li className="rounded-xl border border-[var(--hairline)] bg-white p-4">
              <div className="text-[12px] text-[var(--body)]">Linked organization</div>
              <div className="font-medium text-black">
                {s.parent ? (
                  <Link href={orgHref(s.parent)} className="hover:underline">
                    {s.parent}
                  </Link>
                ) : (
                  "Not linked"
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-[var(--body)]">
                <span>{s.resolved_by ? (RESOLVED_BY_LABEL[s.resolved_by] ?? s.resolved_by) : "No link to an organization has been established."}</span>
                {s.entity_source_url && <SourceLink url={s.entity_source_url} label="Supporting record" />}
              </div>
            </li>
            {cert && (
              <li className="rounded-xl border border-[var(--hairline)] bg-white p-4">
                <div className="mb-2 flex items-center gap-2 text-[12px] text-[var(--body)]">
                  Texas Comptroller registry entry <KindBadge kind="documented" />
                </div>
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(["owner", "occupant", "operator"] as const).map((role) => (
                    <div key={role}>
                      <dt className="text-[12px] capitalize text-[var(--body)]">{role}</dt>
                      <dd className="text-[13px] text-black">{cert[role] ?? "Not listed"}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            )}
          </ol>
        </section>
      </div>

      <section aria-labelledby="ev-h" className="mt-12">
        <SectionTitle id="ev-h" aside={plural(events.length, "record")}>
          Evidence history
        </SectionTitle>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            {factors.length > 0 && (
              <div className="rounded-lg border border-[var(--hairline)] bg-white">
                <div className="border-b border-[var(--hairline)] px-4 py-3 text-[14px] font-medium text-black">Evidence checklist</div>
                {s.state !== "TX" && <p className="border-b border-[var(--hairline)] px-4 py-2.5 text-[13px] text-[var(--body)]">{coverageNote(s.state)}</p>}
                <ul>
                  {factors.map((f, i) => {
                    const ok = !!siteFactors[f.key];
                    const note = ok ? null : factorNote(factorCoverage(f.key, s.state), s.state);
                    return (
                      <li key={f.key} className={`flex items-start gap-3 px-4 py-2.5 text-[14px] ${i ? "border-t border-[var(--hairline)]" : ""}`}>
                        <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-black text-white" : "bg-[var(--canvas-soft)] text-[#939393]"}`}>
                          {ok ? "✓" : "–"}
                        </span>
                        <span className={`flex-1 ${ok ? "text-black" : "text-slate-500"}`}>
                          <span className="sr-only">{ok ? "Met: " : "Not met: "}</span>
                          {f.rule}
                          {note && <span className="block text-[12px] text-slate-500">{note}</span>}
                        </span>
                        <span className="text-[12px] tabular-nums text-slate-500">+{f.points}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {scores.length > 1 && (
              <figure className="mt-6 rounded-lg border border-[var(--hairline)] bg-white p-3">
                <figcaption className="px-1 pb-2 text-[14px] font-medium text-black">Evidence index over time</figcaption>
                <div aria-hidden>
                  <TimeMachine scores={scores} events={events} />
                </div>
              </figure>
            )}
          </div>
          {events.length === 0 ? (
            <p className="text-[14px] text-[var(--body)]">No dated records for this site.</p>
          ) : (
            <ol className="relative ml-2 border-l border-[var(--hairline)]">
              {[...events].reverse().map((e, i) => (
                <li key={`${e.ts}-${e.event_type}-${i}`} className="relative pb-5 pl-5 last:pb-0">
                  <span aria-hidden className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-black" />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                    <time dateTime={e.ts} className="font-medium tabular-nums text-black">
                      {fmtDate(e.ts)}
                    </time>
                    <span className="rounded bg-[var(--canvas-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--hairline-mid)]">{e.source}</span>
                    <SourceLink url={e.source_url} label="View record" />
                  </div>
                  <p className="mt-1 text-[14px] text-[var(--hairline-mid)]">{describeEvent(e)}</p>
                  {e.event_type === "inspection_done" && (
                    <p className="text-[12px] text-slate-500">TDLR doesn&apos;t publish the inspection date. Dated when the status was observed.</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2">
        {p.siblings.length > 0 && s.parent && (
          <section aria-labelledby="sib-h">
            <SectionTitle id="sib-h" aside={<Link href={orgHref(s.parent)} className="rw-link">{s.parent} profile →</Link>}>
              Other {s.parent} sites
            </SectionTitle>
            <ul className="divide-y divide-[var(--hairline)] rounded-lg border border-[var(--hairline)] bg-white text-[14px]">
              {p.siblings.slice(0, 8).map((x) => (
                <li key={x.project_id}>
                  <Link href={siteHref(x.project_id)} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--canvas-softer)]">
                    <span className="truncate font-medium text-black">{x.name}</span>
                    <span className="shrink-0 text-[13px] text-[var(--body)]">{x.city ?? x.county ?? "Location unavailable"}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {p.siblings.length > 8 && <p className="mt-2 text-[13px] text-[var(--body)]">And {p.siblings.length - 8} more on the organization profile.</p>}
          </section>
        )}
        {p.nearby.length > 0 && (
          <section aria-labelledby="near-h">
            <SectionTitle id="near-h">Closest other recorded sites</SectionTitle>
            <ul className="divide-y divide-[var(--hairline)] rounded-lg border border-[var(--hairline)] bg-white text-[14px]">
              {p.nearby.map((x) => (
                <li key={x.project_id}>
                  <Link href={siteHref(x.project_id)} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--canvas-softer)]">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-black">{x.name}</span>
                      <span className="block truncate text-[12px] text-[var(--body)]">{x.parent ?? "Organization not linked"}</span>
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-[var(--body)]">{fmtDistance(x.distance_km)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
