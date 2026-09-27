import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import SearchBox from "@/components/public/SearchBox";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import { Container, EmptyState } from "@/components/public/ui";
import { askGridSight } from "@/lib/gemini";
import { todayUtc } from "@/lib/queries";
import { getOrgIndex } from "@/lib/publicQueries";
import { fmtMW } from "@/lib/format";

export const metadata: Metadata = { title: "Ask Uncloak" };

type Organization = Awaited<ReturnType<typeof getOrgIndex>>[number];

/**
 * A question can include prose ("Tell me more about Amazon"), so the normal
 * search endpoint cannot match it verbatim. Match a known organization name
 * inside that prose, preferring the longest name where names overlap.
 */
function mentionedOrganization(question: string, orgs: Organization[]): Organization | null {
  const normalized = question.toLocaleLowerCase();
  return [...orgs]
    .sort((a, b) => b.name.length - a.name.length)
    .find((org) => normalized.includes(org.name.toLocaleLowerCase())) ?? null;
}

export default async function AskPage(props: PageProps<"/ask">) {
  await connection();
  const raw = (await props.searchParams).q;
  const question = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 500) ?? "";
  const asOf = todayUtc();
  const [result, orgs] = question
    ? await Promise.all([askGridSight(question, asOf), getOrgIndex(asOf).catch(() => [])])
    : [null, []];
  const organization = mentionedOrganization(question, orgs);

  return (
    <>
      <SiteHeader search={false} />
      <main id="main">
        <Container className="py-12">
          <p className="ub-eyebrow">Ask Uncloak</p>
          <h1 className="rw-display-sm mt-3">Answers from the records</h1>
          <p className="mt-3 max-w-2xl text-[17px] leading-7 text-[var(--body)]">
            Ask about data-center projects and companies across the U.S., state permits and registries, or grid load queues. Answers use only the public-record data behind Uncloak.
          </p>
          <div className="mt-8 max-w-3xl">
            <SearchBox size="lg" defaultValue={question} placeholder="Ask a question about U.S. data centers…" />
          </div>

          {!result ? (
            <div className="mt-12">
              <EmptyState title="Ask a question">For example: “Which sites in Loudoun County, Virginia look least certain?”</EmptyState>
            </div>
          ) : (
            <div className="mt-12 grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)]">
              <section className="rounded-xl border border-[var(--hairline)] bg-white p-6 shadow-[var(--shadow-card)]" aria-labelledby="answer-h">
                <p className="rw-meta">Question</p>
                <h2 id="answer-h" className="mt-2 text-[22px] font-medium leading-8 text-black">
                  {question}
                </h2>
                <div className="mt-6 border-t border-[var(--hairline)] pt-6 text-[17px] leading-7 text-black">{result.answer}</div>
                {result.tool_calls.length > 0 && (
                  <p className="mt-6 text-[13px] leading-5 text-[var(--body)]">
                    Answered from {result.tool_calls.map((call) => call.name.replaceAll("_", " ")).join(", ")}.
                  </p>
                )}
              </section>
              {organization && <OrganizationCard organization={organization} />}
            </div>
          )}
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}

function OrganizationCard({ organization }: { organization: Organization }) {
  const dashboardHref = `/dashboard?parent=${encodeURIComponent(organization.name)}`;
  return (
    <aside className="h-fit rounded-xl border border-[var(--hairline)] bg-[var(--canvas-softer)] p-5" aria-label={`${organization.name} record links`}>
      <p className="rw-meta">Organization in the records</p>
      <h2 className="mt-2 text-[21px] font-medium leading-7 text-black">{organization.name}</h2>
      <p className="mt-3 text-[14px] leading-5 text-[var(--body)]">
        {organization.sites.toLocaleString()} {organization.sites === 1 ? "site" : "sites"} linked in our records
        {organization.mw_total != null ? ` · ${fmtMW(organization.mw_total)} estimated` : ""}.
      </p>
      <div className="mt-5 flex flex-col items-stretch gap-2">
        <Link href={`/org/${organization.slug}`} className="ub-pill !w-full !text-[14px]">
          View organization record
        </Link>
        <Link href={dashboardHref} className="ub-pill-subtle !w-full !text-[14px]">
          Open in dashboard
        </Link>
      </div>
    </aside>
  );
}
