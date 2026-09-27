import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import EmbeddedDashboard from "@/components/public/EmbeddedDashboard";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import SitesTable from "@/components/public/SitesTable";
import Tabs from "@/components/public/Tabs";
import TrendChart from "@/components/public/TrendChart";
import { SourceLink } from "@/components/public/Source";
import { BigStat, Breadcrumbs, ContextNote, EmptyState, ErrorState, PAGE_WIDTH, SampleBadge, SampleBanner, StatBand } from "@/components/public/ui";
import { getOrgIndex, getOrgProfile, resolveOrgSlug } from "@/lib/publicQueries";
import { todayUtc } from "@/lib/queries";
import { fmtDate, fmtMW, fmtUSD } from "@/lib/format";
import { RESOLVED_BY_LABEL, SOURCES, type SourceKey } from "@/lib/metrics";
import { countyLabel, STATE_NAMES } from "@/lib/geo";
import { siteHref } from "@/lib/slug";
import type { OrgProfile, Site } from "@/lib/types";

export async function generateMetadata(props: PageProps<"/org/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const org = await resolveOrgSlug(slug).catch(() => null);
  return {
    title: org ? `${org.name}: data-center sites · Uncloak` : "Organization · Uncloak",
    description: org ? `Public records and mapped sites linking ${org.name} to U.S. data-center sites, with sources.` : undefined,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const sum = (xs: (number | null)[]) => {
  const vals = xs.filter((x): x is number => x != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};

async function load(slug: string, asOf: string) {
  try {
    const [profile, orgs] = await Promise.all([getOrgProfile(slug, asOf), getOrgIndex(asOf)]);
    return { ok: true as const, profile, orgs };
  } catch (err) {
    console.error("[gridsight org]", err);
    return { ok: false as const };
  }
}

export default async function OrgPage(props: PageProps<"/org/[slug]">) {
  await connection();
  const { slug } = await props.params;
  const asOf = todayUtc();
  const data = await load(slug, asOf);
  if (data.ok && !data.profile) notFound();

  return (
    <>
      <SiteHeader />
      {data.ok && data.profile && <SampleBanner show={data.profile.sites.some((s) => s.is_sample)} />}
      <main id="main" className={`${PAGE_WIDTH} py-8`}>
        {!data.ok || !data.profile ? <ErrorState /> : <OrgBody p={data.profile} orgs={data.orgs} today={asOf} />}
      </main>
      <SiteFooter updated={data.ok && data.profile?.computed_at ? fmtDate(data.profile.computed_at) : null} />
    </>
  );
}

function OrgBody({ p, orgs, today }: { p: OrgProfile; orgs: Awaited<ReturnType<typeof getOrgIndex>>; today: string }) {
  const s = p.sites;
  const n = s.length;
  const asOfLabel = `As of ${fmtDate(p.as_of)}`;
  const certified = s.filter((x) => x.certified_at);
  const withCost = s.filter((x) => x.total_cost != null);
  const withMw = s.filter((x) => x.mw_est != null);
  const cost = sum(s.map((x) => x.total_cost));
  const mw = sum(s.map((x) => x.mw_est));
  const entitiesWithSites = p.entities.filter((e) => e.sites.length);
  const sourceKeys = p.sources.map((x) => x.source).filter((k): k is SourceKey => k in SOURCES);

  // Keyed by county and state: the same county name exists in many states.
  const counties = new Map<string, { county: string; state: string; n: number }>();
  for (const x of s) {
    if (!x.county) continue;
    const key = `${x.county}|${x.state}`;
    const cur = counties.get(key) ?? { county: x.county, state: x.state, n: 0 };
    cur.n += 1;
    counties.set(key, cur);
  }
  const countyList = [...counties.values()].sort((a, b) => b.n - a.n || a.county.localeCompare(b.county));
  const states = new Set(s.map((x) => x.state));
  const noCounty = s.filter((x) => !x.county).length;

  const earliest = [...s].filter((x) => x.first_evidence).sort((a, b) => Date.parse(a.first_evidence!) - Date.parse(b.first_evidence!))[0];
  const biggest = [...withCost].sort((a, b) => b.total_cost! - a.total_cost!)[0];
  const dashboardHref = `/dashboard?parent=${encodeURIComponent(p.name)}`;

  return (
    <>
      <Breadcrumbs items={[{ label: "Organizations", href: "/org" }, { label: p.name }]} />

      <header className="mt-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: p.color ?? "#94a3b8" }} />
          <span className="ub-eyebrow">Organization</span>
          {s.some((x) => x.is_sample) && <SampleBadge />}
        </div>
        <h1 className="rw-display mt-3 text-black">{p.name}</h1>
        <p className="rw-subtitle mt-4 max-w-3xl">
          {n === 0 ? (
            <>No site in the current records is linked to {p.name}.</>
          ) : (
            <>
              Linked to {plural(n, "data-center site")} in {states.size === 1 && states.has("TX") ? "Texas public records" : "our records"}
              {certified.length === n ? ", all registered for state data-center tax exemptions." : "."}
            </>
          )}
        </p>
        <p className="rw-meta mt-2">Headquarters aren&apos;t in this dataset. Every site here is a facility.</p>
      </header>

      {n > 0 && (
        <>
          {/* Big numbers first: what an average visitor needs at a glance. */}
          <section aria-label="Key numbers" className="mt-10">
            <StatBand>
              <BigStat
                metric="sites"
                label={states.size === 1 ? `Sites in ${STATE_NAMES[[...states][0]] ?? [...states][0]}` : `Sites in ${states.size} states`}
                value={n.toLocaleString()}
                note={p.comparison.rank_sites ? `#${p.comparison.rank_sites} of ${p.comparison.orgs_ranked} organizations` : undefined}
                period={asOfLabel}
                sources={<SourcesInline keys={sourceKeys} />}
              />
              <BigStat
                metric="registered_cost"
                label="Construction cost on file"
                value={cost != null ? fmtUSD(cost) : null}
                note={cost != null ? `Reported for ${withCost.length} of ${n} sites` : "No site reports a cost"}
                period="Registrations filed to date"
                sources={<SourceLink url={SOURCES.TDLR.url} label="TDLR TABS" />}
              />
              <BigStat
                metric="mw_est"
                label="Estimated power demand"
                value={mw != null ? fmtMW(mw) : null}
                note={mw != null ? `Estimated for ${withMw.length} of ${n} sites` : "Needs a construction cost"}
                period={asOfLabel}
                sources={
                  <Link href="/methodology#mw" className="rw-link">
                    How it&apos;s estimated
                  </Link>
                }
              />
              <BigStat
                metric="counties"
                label="Counties"
                value={countyList.length ? countyList.length.toLocaleString() : null}
                note={noCounty ? `${plural(noCounty, "site")} without a published location` : "Every site has a location"}
                period={asOfLabel}
              />
            </StatBand>
          </section>

          {/* The Atlas, already filtered to this organization. */}
          <section aria-labelledby="dash-h" className="mt-16">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="ub-eyebrow">Atlas</p>
                <h2 id="dash-h" className="rw-heading-md mt-2">
                  {p.name} on the map
                </h2>
                <p className="rw-meta mt-2">{p.name}&apos;s sites are highlighted. Click a dot for its evidence, or drag the date to rewind.</p>
              </div>
              <Link href={dashboardHref} className="ub-pill-subtle">
                Open full screen
              </Link>
            </div>
            <EmbeddedDashboard today={today} parent={p.name} href={dashboardHref} />
          </section>

          <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-2">
            <section aria-labelledby="matter-h">
              <h2 id="matter-h" className="rw-heading-sm mb-4">
                Why this might matter to you
              </h2>
              <ContextNote>
                <p>These are the counties where records place {p.name}&apos;s facilities. Pick one to see every recorded site nearby.</p>
                {countyList.length > 0 && (
                  <ul className="flex flex-wrap gap-2" aria-label="Counties with sites">
                    {countyList.map(({ county: c, state: st, n: k }) => (
                      <li key={`${c}|${st}`}>
                        <Link
                          href={`/near?q=${encodeURIComponent(`${countyLabel(c, st)}, ${st}`)}&county=${encodeURIComponent(c)}`}
                          className="inline-block whitespace-nowrap rounded-full bg-white px-3 py-1 text-[13px] font-medium text-black ring-1 ring-inset ring-[#c9ccd1] hover:ring-black"
                        >
                          {countyLabel(c, st)}, {st} · {k}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[13px]">These records don&apos;t measure effects on bills, water or reliability.</p>
              </ContextNote>
            </section>
            <section aria-labelledby="source-h">
              <h2 id="source-h" className="rw-heading-sm mb-4">
                Where this comes from
              </h2>
              <ul className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)] text-[14px]">
                {p.sources.map((src) => {
                  const meta = SOURCES[src.source as SourceKey];
                  return (
                    <li key={src.source} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                      <span>
                        <span className="text-black">{meta?.short ?? src.source}</span>
                        <span className="rw-meta ml-2">
                          {plural(src.records, "record")}
                          {src.retrieved && ` · retrieved ${fmtDate(src.retrieved)}`}
                        </span>
                      </span>
                      {meta && <SourceLink url={meta.url} label="Original source" />}
                    </li>
                  );
                })}
              </ul>
              <ul className="mt-4 space-y-1.5 text-[14px] text-[var(--hairline-mid)]">
                {earliest && (
                  <Finding>
                    First record: <SiteLink s={earliest} />, {fmtDate(earliest.first_evidence)}
                  </Finding>
                )}
                {biggest && (
                  <Finding>
                    Largest cost on file: <SiteLink s={biggest} />, {fmtUSD(biggest.total_cost)}
                  </Finding>
                )}
              </ul>
            </section>
          </div>
        </>
      )}

      <section aria-labelledby="detail-h" className="mt-20">
        <p className="ub-eyebrow">More detail</p>
        <h2 id="detail-h" className="rw-heading-md mt-2 text-black">
          Explore the records
        </h2>
        <div className="mt-2">
          {n === 0 ? (
            <EmptyState title="No linked sites">There is nothing to break down yet for {p.name}.</EmptyState>
          ) : (
            <Tabs
              label={`${p.name} details`}
              tabs={[
                {
                  id: "sites",
                  label: `Sites (${n})`,
                  content: (
                    <div className="space-y-3">
                      <SitesTable sites={s} caption={`${p.name} sites in our records`} />
                      <p className="rw-meta">Each site is counted once, so totals never double count.</p>
                    </div>
                  ),
                },
                {
                  id: "trend",
                  label: "Over time",
                  content:
                    p.trend.length > 1 ? (
                      <TrendChart points={p.trend} name={p.name} />
                    ) : (
                      <EmptyState title="Not enough history for a trend" />
                    ),
                },
                {
                  id: "entities",
                  label: `Registered entities (${entitiesWithSites.length})`,
                  content: (
                    <ul className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
                      {p.entities.map((e) => (
                        <li key={e.llc_name} className="grid grid-cols-1 gap-1 py-4 text-[14px] md:grid-cols-[1fr_1fr_auto] md:items-center md:gap-4">
                          <div className="text-black">{e.llc_name}</div>
                          <div className="rw-meta">
                            {e.resolved_by ? (RESOLVED_BY_LABEL[e.resolved_by] ?? e.resolved_by) : "Link basis not recorded"}
                            {e.sites.length > 0 && (
                              <span className="block">
                                {e.sites.map((x, i) => (
                                  <span key={x.project_id}>
                                    {i > 0 && ", "}
                                    <Link href={siteHref(x.project_id)} className="text-black hover:underline">
                                      {x.name}
                                    </Link>
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                          <SourceLink url={e.source_url} label="Supporting record" />
                        </li>
                      ))}
                    </ul>
                  ),
                },
                {
                  id: "compare",
                  label: "Compare",
                  content: <Compare p={p} orgs={orgs} mw={mw} />,
                },
              ]}
            />
          )}
        </div>
      </section>
    </>
  );
}

function Finding({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-black" />
      <span>{children}</span>
    </li>
  );
}

function SiteLink({ s }: { s: Site }) {
  return (
    <Link href={siteHref(s.project_id)} className="font-medium text-black underline-offset-2 hover:underline">
      {s.name}
    </Link>
  );
}

function SourcesInline({ keys }: { keys: SourceKey[] }) {
  if (!keys.length) return <span>No linked records</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-3">
      {keys.map((k) => (
        <SourceLink key={k} url={SOURCES[k].url} label={SOURCES[k].short} />
      ))}
    </span>
  );
}

function Compare({ p, orgs, mw }: { p: OrgProfile; orgs: Awaited<ReturnType<typeof getOrgIndex>>; mw: number | null }) {
  const c = p.comparison;
  const n = p.sites.length;
  const top = orgs.filter((o) => o.sites > 0).slice(0, 10);
  const inTop = top.some((o) => o.name === p.name);
  const rows = inTop ? top : [...top, orgs.find((o) => o.name === p.name)!].filter(Boolean);
  const max = Math.max(...rows.map((o) => o.sites), 1);
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <dl className="space-y-4 text-[15px]">
        <div>
          <dt className="text-[13px] text-[var(--body)]">Share of all sites linked to an organization</dt>
          <dd className="text-[30px] font-normal tracking-[-0.9px] text-black">
            {c.total_sites ? `${((n / c.total_sites) * 100).toFixed(1)}%` : "Unavailable"}
            <span className="ml-2 text-[14px] font-normal text-[var(--body)]">
              {n} of {c.total_sites}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-[var(--body)]">Share of estimated power demand (Uncloak estimate)</dt>
          <dd className="text-[30px] font-normal tracking-[-0.9px] text-black">
            {mw != null && c.total_mw ? `${((mw / c.total_mw) * 100).toFixed(1)}%` : "Unavailable"}
            {mw != null && c.total_mw ? <span className="ml-2 text-[14px] font-normal text-[var(--body)]">{fmtMW(mw)} of {fmtMW(c.total_mw)}</span> : null}
          </dd>
          {c.rank_mw && <dd className="text-[13px] text-[var(--body)]">#{c.rank_mw} by estimated power among organizations with an estimate</dd>}
        </div>
        <div>
          <dt className="text-[13px] text-[var(--body)]">The typical (median) organization has</dt>
          <dd className="text-[30px] font-normal tracking-[-0.9px] text-black">{c.median_sites != null ? plural(c.median_sites, "site") : "Unavailable"}</dd>
        </div>
        <p className="text-[12px] leading-5 text-slate-500">
          Comparisons include only the {c.orgs_ranked} organizations linked to at least one site. Sites whose owner isn&apos;t resolved are left out
          rather than guessed. Estimated power covers only sites with a registered cost.
        </p>
      </dl>
      <figure>
        <figcaption className="mb-3 text-[14px] font-medium text-black">Sites per organization</figcaption>
        <ul className="space-y-2">
          {rows.map((o) => (
            <li key={o.slug} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-[13px]">
              <Link href={`/org/${o.slug}`} className={`truncate hover:underline ${o.name === p.name ? "font-bold text-black" : "text-[var(--hairline-mid)]"}`}>
                {o.name}
              </Link>
              <span className="h-3 rounded-full bg-[var(--canvas-soft)]" aria-hidden>
                <span className="block h-3 rounded-full" style={{ width: `${(o.sites / max) * 100}%`, background: o.name === p.name ? "#000" : "#a3a3a3" }} />
              </span>
              <span className="text-right tabular-nums">{o.sites}</span>
            </li>
          ))}
        </ul>
      </figure>
    </div>
  );
}
