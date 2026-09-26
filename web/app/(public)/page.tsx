import Link from "next/link";
import { connection } from "next/server";
import SearchBox from "@/components/public/SearchBox";
import LocateButton from "@/components/public/LocateButton";
import HeroVisual from "@/components/public/HeroVisual";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import { Container, ErrorState, KindBadge, SampleBanner, SectionTitle } from "@/components/public/ui";
import { SourceLink } from "@/components/public/Source";
import { getOrgIndex, getSites } from "@/lib/publicQueries";
import { getSummary, todayUtc } from "@/lib/queries";
import { fmtDate, fmtGW } from "@/lib/format";
import { KIND_HELP, KIND_LABEL, type MetricKind } from "@/lib/metrics";

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
        <section className="px-4 sm:px-8">
          <div className="relative flex min-h-[560px] flex-col justify-end rounded-2xl text-white sm:min-h-[min(calc(100svh-5.5rem),860px)]">
            <HeroVisual points={data.ok ? data.sites.filter((x) => x.lat != null && x.lon != null).map((x) => ({ lat: x.lat!, lon: x.lon!, mw: x.mw_est })) : []} />
            <div className="relative px-6 pb-10 pt-24 sm:px-12 sm:pb-14 lg:px-16 lg:pb-16">
              <p className="text-[13px] font-medium uppercase tracking-[0.35px] text-white/60">U.S. data-center records</p>
              <h1 className="mt-4 max-w-4xl text-[40px] font-medium leading-[1.05] tracking-[-1.2px] text-white sm:text-[64px] sm:tracking-[-1.8px]">
                Who is building data centers in the U.S., and where?
              </h1>
              <p className="mt-6 max-w-2xl text-[18px] leading-[1.5] text-white/85 sm:text-[21px]">
                Search a company, a place or a ZIP code — or ask a question. Every answer and number links to its source. Texas has the
                deepest public records; other states start from mapped sites.
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
              {data.ok && (
                <p className="mt-10 text-[12px] text-white/50 sm:absolute sm:bottom-6 sm:right-8 sm:mt-0 sm:text-right">
                  Each point is one of the {data.sites.filter((x) => x.lat != null).length} recorded sites with a published, reviewed or mapped location.
                </p>
              )}
            </div>
          </div>
        </section>

        <Container className="py-16 sm:py-24">
          {!data.ok ? (
            <ErrorState />
          ) : (
            <>
              <SectionTitle aside={`As of ${fmtDate(asOf)}`}>At a glance</SectionTitle>
              <div className="grid gap-px overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--hairline)] lg:grid-cols-3">
                <Glance
                  value={data.sites.length.toLocaleString()}
                  label="data-center sites on record"
                  detail={`${data.sites.filter((s) => s.lat != null).length} with a known location · ${new Set(data.sites.map((s) => s.state)).size} states and territories`}
                  kind="documented"
                  source={<Link href="/methodology#sources" className="rw-link">Texas public records and the IM3 data-center atlas</Link>}
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

              <div className="mt-24 grid gap-16 lg:grid-cols-[1.2fr_1fr]">
                <section aria-labelledby="orgs-h">
                  <SectionTitle id="orgs-h" aside={<Link href="/org" className="rw-link">All organizations →</Link>}>
                    Organizations with the most sites
                  </SectionTitle>
                  <ol className="divide-y divide-[var(--hairline)] rounded-lg border border-[var(--hairline)] bg-white">
                    {data.orgs.slice(0, 8).map((o, i) => (
                      <li key={o.slug}>
                        <Link href={`/org/${o.slug}`} className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--canvas-softer)]">
                          <span className="w-5 text-right text-[13px] tabular-nums text-slate-400">{i + 1}</span>
                          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color ?? "#94a3b8" }} />
                          <span className="min-w-0 flex-1 truncate text-[16px] text-black">{o.name}</span>
                          <span className="text-[13px] tabular-nums text-[var(--body)]">
                            {o.sites} site{o.sites === 1 ? "" : "s"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-[12px] leading-5 text-slate-500">
                    Ranked by the number of sites linked to each organization in these records, not by size or investment.
                  </p>
                </section>

                <section aria-labelledby="read-h">
                  <SectionTitle id="read-h">How to read this site</SectionTitle>
                  <ul className="space-y-4">
                    {(["documented", "derived", "context"] as MetricKind[]).map((k) => (
                      <li key={k} className="flex gap-3">
                        <div className="w-[128px] shrink-0 pt-0.5">
                          <KindBadge kind={k} />
                        </div>
                        <p className="text-[14px] leading-6 text-[var(--hairline-mid)]">
                          <span className="sr-only">{KIND_LABEL[k]}: </span>
                          {KIND_HELP[k]}
                        </p>
                      </li>
                    ))}
                    <li className="flex gap-3">
                      <div className="w-[128px] shrink-0 pt-0.5 text-[13px] font-semibold text-slate-500">Unavailable</div>
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
                      Open the advanced dashboard
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
    <div className="bg-white p-6 sm:p-8">
      <div className="flex items-start justify-between gap-2">
        <div className="whitespace-nowrap text-[48px] font-normal leading-none tracking-[-2px] text-black sm:text-[56px] 2xl:text-[64px]">{value}</div>
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
  const top = orgs.filter((o) => o.sites > 0).slice(0, 4);
  const maxSites = Math.max(...top.map((o) => o.sites), 1);
  // Weekly count of sites with public records (continuous aggregate), for the time-machine card.
  const weekly = summary.weekly.map((w) => w.projects);
  const maxW = Math.max(...weekly, 1);
  const spark = weekly.map((v, i) => `${((i / Math.max(weekly.length - 1, 1)) * 100).toFixed(2)},${(38 - (v / maxW) * 34).toFixed(2)}`).join(" ");

  const cards = [
    {
      title: "Look up any company",
      text: "See every site tied to a company, even behind unfamiliar LLC names.",
      href: "/org/google",
      cta: "Try Google",
      visual: (
        <div className="flex h-full flex-col justify-end gap-2.5 p-5">
          {top.map((o) => (
            <div key={o.slug} className="flex items-center gap-3 text-[12px] text-white/80">
              <span className="w-20 truncate">{o.name}</span>
              <span className="h-2 flex-1 rounded-full bg-white/10">
                <span className="block h-2 rounded-full bg-white" style={{ width: `${(o.sites / maxSites) * 100}%` }} />
              </span>
              <span className="w-6 text-right tabular-nums">{o.sites}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Find what's near you",
      text: "Enter a city, ZIP or address and see the recorded sites around it, with distances.",
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
      text: "Replay any week since 2024 and watch sites appear as filings land.",
      href: "/dashboard",
      cta: "Open the time machine",
      visual: (
        <div className="flex h-full flex-col justify-end p-5">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-24 w-full" aria-hidden>
            {spark && <polyline points={`0,40 ${spark} 100,40`} fill="rgba(255,255,255,0.08)" stroke="none" />}
            {spark && <polyline points={spark} fill="none" stroke="#fff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}
          </svg>
          <div className="mt-2 flex justify-between text-[11px] text-white/50">
            <span>2024</span>
            <span>Sites with records, weekly</span>
            <span>Today</span>
          </div>
        </div>
      ),
    },
    {
      title: "Check every number",
      text: "Each figure links to the state filing it came from. Nothing is shown without a source.",
      href: "/methodology",
      cta: "How it works",
      visual: (
        <div className="flex h-full flex-col justify-center gap-2 p-5">
          {["Texas Comptroller registry", "TDLR construction filings", "TCEQ permits", "ERCOT queue reports", "Illinois DCEO data-center MOUs", "Minnesota DEED qualified data centers", "IM3 data-center atlas (OpenStreetMap)"].map((t) => (
            <div key={t} className="flex items-center gap-2.5 rounded-md bg-white/[0.07] px-3 py-2 text-[12px] text-white/85">
              <span aria-hidden className="grid h-4 w-4 place-items-center rounded-full bg-white text-[9px] font-bold text-black">
                ✓
              </span>
              {t}
            </div>
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
      <ul className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <li key={c.title}>
            <Link href={c.href} className="group block">
              <div className="aspect-[16/10] overflow-hidden rounded-lg bg-[#111] transition-transform duration-300 group-hover:scale-[1.01]">{c.visual}</div>
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
