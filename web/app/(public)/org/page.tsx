import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import { Container, ErrorState, SampleBanner, Unavailable } from "@/components/public/ui";
import { getOrgIndex, getSites } from "@/lib/publicQueries";
import { todayUtc } from "@/lib/queries";
import { fmtDate, fmtMW } from "@/lib/format";

export const metadata: Metadata = { title: "Organizations · Uncloak" };

async function load(asOf: string) {
  try {
    const [orgs, sites] = await Promise.all([getOrgIndex(asOf), getSites(asOf)]);
    return { ok: true as const, orgs, unlinked: sites.filter((s) => !s.parent).length, sample: sites.some((s) => s.is_sample) };
  } catch (err) {
    console.error("[gridsight orgs]", err);
    return { ok: false as const };
  }
}

export default async function OrgIndex() {
  await connection();
  const asOf = todayUtc();
  const data = await load(asOf);
  return (
    <>
      <SiteHeader />
      {data.ok && <SampleBanner show={data.sample} />}
      <main id="main">
        <Container className="py-12">
          <p className="ub-eyebrow">Organizations</p>
          <h1 className="rw-display-sm mt-3">Who is behind U.S. data-center sites</h1>
          <p className="rw-subtitle mt-5 max-w-3xl">
            Companies linked to at least one data-center site: through the entities named as owner, occupant, operator or tenant on public records (Texas
            and state incentive registries), elsewhere through the operator named on the mapped site. Ranked by number of sites, not by size or investment.
          </p>
          <div className="mt-12">
            {!data.ok ? (
              <ErrorState />
            ) : (
              <>
                <div className="relative overflow-x-auto border-y border-[var(--hairline)]">
                  <table className="w-full text-left text-[15px]">
                    <caption className="sr-only">Organizations as of {fmtDate(asOf)}</caption>
                    <thead className="text-[13px] text-[var(--slate)]">
                      <tr className="border-b border-[var(--hairline)]">
                        <th scope="col" className="py-3 pr-4 font-medium">Organization</th>
                        <th scope="col" className="py-3 pr-4 text-right font-medium">Sites</th>
                        <th scope="col" className="py-3 text-right font-medium">
                          Estimated power<span className="sr-only sm:not-sr-only"> (Uncloak estimate)</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--hairline)]">
                      {data.orgs.map((o) => (
                        <tr key={o.slug}>
                          <th scope="row" className="py-3 pr-4 font-normal">
                            <Link href={`/org/${o.slug}`} className="inline-flex items-center gap-2.5 text-black hover:underline hover:underline-offset-4">
                              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color ?? "#939393" }} />
                              {o.name}
                            </Link>
                            {o.is_sample && <span className="ml-2 text-[11px] font-semibold uppercase text-amber-800">Sample</span>}
                          </th>
                          <td className="py-3 pr-4 text-right tabular-nums">{o.sites}</td>
                          <td className="whitespace-nowrap py-3 text-right tabular-nums">{o.mw_total != null ? fmtMW(o.mw_total) : <Unavailable why="No site has a registered construction cost" />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="rw-meta mt-4">
                  {data.unlinked} sites aren&apos;t linked to any organization yet and aren&apos;t counted above. They still appear in search, nearby
                  results and the Atlas. <Link href="/methodology#linking" className="rw-link">How linking works</Link>
                </p>
              </>
            )}
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
