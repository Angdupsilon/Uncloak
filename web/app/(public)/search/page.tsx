import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import SearchBox, { KindChip } from "@/components/public/SearchBox";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import { Container, EmptyState, ErrorState } from "@/components/public/ui";
import { search } from "@/lib/publicQueries";
import type { SearchHit, SearchKind } from "@/lib/types";

export const metadata: Metadata = { title: "Search · Uncloak" };

const GROUPS: { title: string; kinds: SearchKind[]; help: string }[] = [
  { title: "Organizations", kinds: ["org"], help: "Companies linked to sites through registered entities" },
  { title: "Places", kinds: ["city", "county", "zip", "place"], help: "Find recorded sites near a location" },
  { title: "Sites", kinds: ["site"], help: "Individual data-center facilities in the records" },
  { title: "Registered entities", kinds: ["entity"], help: "LLCs and other entities named on the records" },
];

async function run(q: string) {
  try {
    return { ok: true as const, hits: await search(q, 25) };
  } catch (err) {
    console.error("[gridsight search]", err);
    return { ok: false as const };
  }
}

export default async function SearchPage(props: PageProps<"/search">) {
  await connection();
  const raw = (await props.searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const res = q.length >= 2 ? await run(q) : null;
  // The "sites near …" suggestion is always present, so real matches are everything else.
  const real = res?.ok ? res.hits.filter((h) => h.kind !== "place" && h.kind !== "zip") : [];

  return (
    <>
      <SiteHeader search={false} />
      <main id="main">
        <Container className="py-12">
          <p className="ub-eyebrow">Search</p>
          <h1 className="rw-display-sm mt-3">{q ? <>Results for &ldquo;{q}&rdquo;</> : "Search the records"}</h1>
          <div className="mt-8 max-w-3xl">
            <SearchBox size="lg" defaultValue={q} />
          </div>

          <div className="mt-12">
            {!res ? (
              <EmptyState title="Type at least two characters">Try a company (Google, Anthropic), a city (Abilene), a county (Ellis County) or a ZIP code.</EmptyState>
            ) : !res.ok ? (
              <ErrorState />
            ) : (
              <>
                {real.length === 0 && (
                  <div className="mb-10">
                    <EmptyState title={`No organizations, sites or entities match “${q}”`}>
                      The records only cover Texas data-center sites. Check the spelling, try a shorter name, or search the place instead. Many sites are
                      filed under LLC names, so a company can appear under a different name.
                    </EmptyState>
                  </div>
                )}
                <div className="space-y-12">
                  {GROUPS.map((g) => {
                    const hits = res.hits.filter((h) => g.kinds.includes(h.kind));
                    if (!hits.length) return null;
                    return (
                      <section key={g.title} aria-labelledby={`g-${g.kinds[0]}`}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--hairline)] pb-3">
                          <h2 id={`g-${g.kinds[0]}`} className="rw-heading-sm">
                            {g.title} <span className="text-[var(--slate)]">{hits.length}</span>
                          </h2>
                          <span className="rw-meta">{g.help}</span>
                        </div>
                        <ul className="divide-y divide-[var(--hairline)]">
                          {hits.map((h, i) => (
                            <HitRow key={`${h.href}-${i}`} h={h} />
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}

function HitRow({ h }: { h: SearchHit }) {
  return (
    <li>
      <Link href={h.href} className="group flex items-start gap-4 py-4">
        <KindChip kind={h.kind} />
        <span className="min-w-0">
          <span className="block text-[17px] text-black group-hover:underline group-hover:underline-offset-4">
            {h.label}
            {h.is_sample && <span className="ml-2 text-[11px] font-semibold uppercase text-amber-800">Sample</span>}
          </span>
          <span className="rw-meta mt-1 block">{h.sublabel}</span>
        </span>
      </Link>
    </li>
  );
}
