import Link from "next/link";
import { connection } from "next/server";
import SearchBox from "@/components/public/SearchBox";
import LocateButton from "@/components/public/LocateButton";
import HeroReel from "@/components/public/HeroReel";
import OrgRanking from "@/components/public/OrgRanking";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import { Container, ErrorState, KindBadge, PAGE_WIDTH, SampleBanner, SectionTitle } from "@/components/public/ui";
import { SourceLink } from "@/components/public/Source";
import { getOrgIndex, getSites } from "@/lib/publicQueries";
import { getSummary, todayUtc } from "@/lib/queries";
import { fmtDate, fmtGW } from "@/lib/format";
import { KIND_HELP, KIND_LABEL, REFERENCE_SOURCES, SOURCES, type MetricKind } from "@/lib/metrics";

const EXAMPLES = [
  { label: "Google", href: "/org/google", kind: "Organization" },
  { label: "Anthropic", href: "/org/anthropic", kind: "Organization" },
  { label: "Abilene", href: "/near?q=Abilene%2C%20TX", kind: "City" },
  { label: "Loudoun County, VA", href: "/near?q=Loudoun%20County%2C%20VA&county=Loudoun", kind: "County" },
  { label: "Ellis County", href: "/near?q=Ellis%20County%2C%20TX&county=Ellis", kind: "County" },
  { label: "78725", href: "/near?q=78725", kind: "ZIP code" },
];

async function load(asOf: string) {
  try {
    const [summary, sites, orgs] = await Promise.all([getSummary(asOf), getSites(asOf), getOrgIndex(asOf)]);
    return { ok: true as const, summary, sites, orgs };
  } catch (err) {
    console.error("[gridsight home]", err);
    return { ok: false as const };
  }
}

export default async function Home() {
  await connection();
  const asOf = todayUtc();
  const data = await load(asOf);

  return (
    <>
      <SiteHeader search={false} />
      {data.ok && <SampleBanner show={data.sites.some((s) => s.is_sample)} />}
      <main id="main">
        {/* Inset cinematic panel (DESIGN.md hero-photo): content anchored bottom-left. */}
        <section className={PAGE_WIDTH}>
          <div className="relative flex min-h-[520px] flex-col justify-end rounded-2xl text-white sm:min-h-[min(calc(100svh-5.5rem),860px)]">
            <HeroReel />
            <div className="relative px-5 pb-8 pt-20 sm:px-12 sm:pb-14 sm:pt-24 lg:px-16 lg:pb-16">
              <p className="text-[13px] font-medium uppercase tracking-[0.35px] text-white/60">U.S. data-center records</p>
              <h1 className="mt-4 max-w-4xl text-[40px] font-medium leading-[1.05] tracking-[-1.2px] text-white sm:text-[64px] sm:tracking-[-1.8px]">
                Who’s building data centers in the U.S.?
              </h1>
              <p className="mt-6 max-w-2xl text-[18px] leading-[1.5] text-white/85 sm:text-[21px]">
                Find companies and nearby sites. Ask questions. Follow the public records.
              </p>
              <div className="mt-8">
                <div className="max-w-2xl">
                  <SearchBox size="lg" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 xl:flex-nowrap">
                  <span className="text-[13px] text-white/60">Try:</span>
                  {EXAMPLES.map((e) => (
                    <Link
                      key={e.label}
                      href={e.href}
                      className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur-sm hover:bg-white hover:text-black"
                    >
                      {e.label}
                      <span className="sr-only"> ({e.kind})</span>
                    </Link>
                  ))}
                  <LocateButton dark />
                </div>
              </div>
            </div>
          </div>
        </section>

        <Container className="py-16 sm:py-24">
          {!data.ok ? (
            <ErrorState />
          ) : (
            <>
              <SectionTitle aside={`As of ${fmtDate(asOf)}`}>At a glance</SectionTitle>
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--hairline)] md:grid-cols-3">
                <Glance
                  value={data.sites.length.toLocaleString()}
                  label="data-center sites on record"
                  detail={`${data.sites.filter((s) => s.lat != null).length} with a known location · ${new Set(data.sites.map((s) => s.state)).size} states and territories`}
                  kind="documented"
                  source={<Link href="/methodology#sources" className="rw-link">State public records and the IM3 data-center atlas</Link>}
                />
                <Glance
                  value={data.orgs.filter((o) => o.sites > 0).length.toLocaleString()}
                  label="companies identified"
                  detail={`${data.sites.filter((s) => !s.parent).length} sites not yet linked to a company`}
                  kind="documented"
                  source={<Link href="/methodology#linking" className="rw-link">How sites are linked</Link>}
                />
                <Glance
                  value={fmtGW(data.summary.ercot?.gw_requested ?? null, 0)}
                  label="requested from the Texas grid"
                  detail={data.summary.ercot ? `All large loads statewide, not only data centers · ${fmtDate(data.summary.ercot.ts)}` : "No ERCOT figure on record"}
                  kind="context"
                  source={<SourceLink url={data.summary.ercot?.source_url} label="ERCOT report" />}
                />
              </div>

              <Features summary={data.summary} orgs={data.orgs} />

              <div className="mt-24 grid grid-cols-1 gap-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <section aria-labelledby="orgs-h">
                  <SectionTitle id="orgs-h" aside={<Link href="/org" className="rw-link">All organizations →</Link>}>
                    Organizations with the most sites
                  </SectionTitle>
                  <OrgRanking orgs={data.orgs} />
                  <p className="mt-3 text-[12px] leading-5 text-slate-500">
                    Ranked by recorded site count, not size or investment.
                  </p>
                </section>

                <section aria-labelledby="read-h">
                  <SectionTitle id="read-h">How to read this site</SectionTitle>
                  {/* One shared grid so the badge column always fits the widest badge. */}
                  <ul className="grid grid-cols-[minmax(128px,max-content)_1fr] gap-x-4 gap-y-4">
                    {(["documented", "derived", "modeled", "context"] as MetricKind[]).map((k) => (
                      <li key={k} className="col-span-2 grid grid-cols-subgrid">
                        <div className="pt-0.5">
                          <KindBadge kind={k} stacked />
                        </div>
                        <p className="text-[14px] leading-6 text-[var(--hairline-mid)]">
                          <span className="sr-only">{KIND_LABEL[k]}: </span>
                          {KIND_HELP[k]}
                        </p>
                      </li>
                    ))}
                    <li className="col-span-2 grid grid-cols-subgrid">
                      <div className="pt-0.5 text-[13px] font-semibold text-slate-500">Unavailable</div>
                      <p className="text-[14px] leading-6 text-[var(--hairline-mid)]">
                        The records we have don&apos;t report it. It is never shown as zero.
                      </p>
                    </li>
                  </ul>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href="/methodology" className="ub-pill-subtle !text-[14px]">
                      Read the methodology
                    </Link>
                    <Link href="/dashboard" className="ub-pill-subtle !text-[14px]">
                      Open the Atlas
                    </Link>
                  </div>
                </section>
              </div>
            </>
          )}
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}

function Glance({
  value,
  label,
  detail,
  kind,
  source,
}: {
  value: string;
  label: string;
  detail: string;
  kind: MetricKind;
  source: React.ReactNode;
}) {
  return (
    <div className="bg-white p-6 lg:p-8">
      {/* Three across from md up: the badge sits above the number until the columns are wide enough to share a row. */}
      <div className="flex items-start justify-between gap-2 md:flex-col-reverse md:justify-start md:gap-4 xl:flex-row xl:justify-between xl:gap-2">
        <div className="whitespace-nowrap text-[48px] font-normal leading-none tracking-[-2px] text-black md:text-[44px] lg:text-[52px] xl:text-[56px] 2xl:text-[64px]">{value}</div>
        <KindBadge kind={kind} />
      </div>
      <div className="mt-4 text-[16px] leading-6 text-black">{label}</div>
      <p className="mt-2 text-[13px] leading-5 text-[var(--body)]">{detail}</p>
      <div className="mt-3 text-[12px]">{source}</div>
    </div>
  );
}

// ── "What you can do" (DESIGN.md research-card grid): thumbnail, title, one line, link ──

type Orgs = Awaited<ReturnType<typeof getOrgIndex>>;
type Summary = Awaited<ReturnType<typeof getSummary>>;

function Features({ summary, orgs }: { summary: Summary; orgs: Orgs }) {
  // Six rows fit once the card is wide (and so tall) enough; the last two are hidden below that.
  const top = orgs.filter((o) => o.sites > 0).slice(0, 6);
  const maxSites = Math.max(...top.map((o) => o.sites), 1);
  // Weekly count of sites with public records (continuous aggregate), for the time-machine card.
  const weekly = summary.weekly.map((w) => w.projects);
  const maxW = Math.max(...weekly, 1);
  const spark = weekly.map((v, i) => `${((i / Math.max(weekly.length - 1, 1)) * 100).toFixed(2)},${(38 - (v / maxW) * 34).toFixed(2)}`).join(" ");

  const cards = [
    {
      title: "Look up any company",
      text: "Find a company’s recorded sites, including those filed under LLCs.",
      href: "/org/google",
      cta: "Try Google",
      visual: (
        <div className="flex h-full flex-col justify-center gap-2.5 p-5 @md:gap-4 @md:p-8">
          {top.map((o, i) => (
            <div key={o.slug} className={`items-center gap-3 text-[12px] text-white/80 @md:text-[14px] ${i < 4 ? "flex" : "hidden @md:flex"}`}>
              <span className="w-20 truncate @md:w-28">{o.name}</span>
              <span className="h-2 flex-1 rounded-full bg-white/10">
                <span className="block h-2 rounded-full bg-white" style={{ width: `${(o.sites / maxSites) * 100}%` }} />
              </span>
              <span className="w-8 text-right tabular-nums">{o.sites}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Find what's near you",
      text: "Search a city, ZIP or address to find nearby sites.",
      href: "/near?q=Abilene%2C%20TX",
      cta: "Try Abilene",
      visual: (
        <svg viewBox="0 0 160 100" className="h-full w-full" aria-hidden>
          {[14, 28, 42].map((r) => (
            <circle key={r} cx="80" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeDasharray="2 3" />
          ))}
          <circle cx="80" cy="50" r="3.5" fill="#fff" />
          {[
            [96, 40],
            [70, 30],
            [108, 62],
            [58, 66],
            [118, 34],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="6" fill="rgba(255,138,61,0.35)" />
              <circle cx={x} cy={y} r="2" fill="#ffd9a8" />
            </g>
          ))}
        </svg>
      ),
    },
    {
      title: "Rewind the record",
      text: "See how the records changed, week by week since 2024.",
      href: "/dashboard",
      cta: "Open the time machine",
      visual: (
        <div className="flex h-full flex-col p-5 pt-8 @md:p-8 @md:pt-12">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="min-h-0 w-full flex-1" aria-hidden>
            {spark && <polyline points={`0,40 ${spark} 100,40`} fill="rgba(255,255,255,0.08)" stroke="none" />}
            {spark && <polyline points={spark} fill="none" stroke="#fff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}
          </svg>
          <div className="mt-2 flex justify-between text-[11px] text-white/50 @md:text-[12px]">
            <span>2024</span>
            <span>Sites with records, weekly</span>
            <span>Today</span>
          </div>
        </div>
      ),
    },
    {
      title: "Check every number",
      text: "Trace each figure to its source record.",
      href: "/methodology",
      cta: "How it works",
      visual: (
        // Short names from the methodology source list, so a new source shows up here too. They wrap to the card's width.
        <div className="flex h-full flex-wrap content-center items-center justify-center gap-1 p-3 @xs:gap-1.5 @xs:p-4 @sm:gap-2 @md:p-8">
          {[...Object.values(SOURCES), REFERENCE_SOURCES.GA_PSC, REFERENCE_SOURCES.PJM].map((src) => (
            <span
              key={src.short}
              className="flex items-center gap-1.5 rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/85 @xs:py-1 @xs:pl-1.5 @xs:pr-2.5 @sm:text-[12px] @lg:py-1.5 @lg:text-[13px]"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="hidden h-3.5 w-3.5 shrink-0 @xs:block">
                <circle cx="8" cy="8" r="8" fill="#fff" />
                <path d="M4.5 8.3 7 10.7l4.5-5" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {src.short}
            </span>
          ))}
        </div>
      ),
    },
  ];

  return (
    <section aria-labelledby="features-h" className="mt-24">
      <p className="ub-eyebrow">What you can do</p>
      <h2 id="features-h" className="rw-heading-md mt-2">
        Public records, made readable
      </h2>
      <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <li key={c.title}>
            <Link href={c.href} className="group block">
              <div className="@container aspect-[16/10] overflow-hidden rounded-lg bg-[#111] transition-transform duration-300 group-hover:scale-[1.01]">{c.visual}</div>
              <h3 className="mt-4 text-[20px] leading-tight tracking-[-0.4px] text-black">{c.title}</h3>
              <p className="mt-2 text-[15px] leading-6 text-[var(--graphite)]">{c.text}</p>
              <span className="mt-3 inline-block text-[14px] font-semibold text-black underline decoration-[#c9ccd1] underline-offset-4 group-hover:decoration-black">
                {c.cta} →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
