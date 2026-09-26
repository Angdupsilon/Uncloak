import Link from "next/link";
import SearchBox from "./SearchBox";
import { Container } from "./ui";
import { SOURCES } from "@/lib/metrics";

const NAV = [
  { href: "/org", label: "Organizations" },
  { href: "/near", label: "Near me" },
  { href: "/search", label: "Search" },
  { href: "/queue", label: "Queue Timeline" },
  { href: "/methodology", label: "Methodology" },
];

/**
 * Nav bar per DESIGN.md: wordmark left, centred links, right cluster of a quiet grey pill
 * and one black pill. Profile pages add the compact search in the right cluster.
 */
export function SiteHeader({ search = true, query = "" }: { search?: boolean; query?: string }) {
  return (
    <header className="bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[3000] focus:rounded-full focus:bg-black focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <div className="flex min-h-16 w-full flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-8">
        <Link href="/" className="shrink-0" aria-label="Uncloak home">
          <span className="gs-wordmark text-[34px] font-bold leading-10 tracking-[-1.4px] text-black">Uncloak</span>
        </Link>
        <nav aria-label="Main" className="order-3 w-full lg:order-none lg:w-auto lg:flex-1">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-0 text-[15px] font-medium text-[var(--ink-soft)] lg:justify-center lg:gap-x-9">
            {NAV.map((n) => (
              <li key={n.href} className="shrink-0">
                <Link href={n.href} className="inline-block py-2 hover:underline hover:underline-offset-4">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {search ? (
            <div className="hidden w-[280px] md:block">
              <SearchBox size="sm" defaultValue={query} placeholder="Search Google, Abilene…" />
            </div>
          ) : (
            <Link
              href="/methodology#sources"
              className="hidden h-10 items-center rounded-lg bg-[#eef0f3] px-4 text-[15px] font-medium text-black hover:bg-[#e2e5ea] sm:inline-flex"
            >
              Sources
            </Link>
          )}
          <Link href="/dashboard" className="inline-flex h-10 items-center rounded-lg bg-[#1f1f1f] px-4 text-[15px] font-medium text-white hover:bg-black">
            Advanced dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ updated }: { updated?: string | null }) {
  return (
    <footer className="mt-24 bg-[#030303] text-white">
      <Container className="grid gap-10 py-16 text-[15px] leading-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="gs-wordmark text-[30px] font-bold tracking-[-1.2px]">Uncloak</div>
          <p className="mt-3 max-w-sm text-white/70">
            An independent research tool built from Texas public records. Every figure links to the record it came from. Missing data is labeled
            unavailable, never shown as zero.
          </p>
          {updated && <p className="mt-3 text-[13px] text-white/50">Scores last computed {updated}.</p>}
        </div>
        <div>
          <div className="text-[13px] font-medium uppercase tracking-[0.35px] text-[#939393]">Sources</div>
          <ul className="mt-3 space-y-2">
            {Object.values(SOURCES).map((s) => (
              <li key={s.short}>
                <a href={s.url} target="_blank" rel="noreferrer" className="text-white hover:underline hover:underline-offset-4">
                  {s.name}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[13px] font-medium uppercase tracking-[0.35px] text-[#939393]">Understand the data</div>
          <ul className="mt-3 space-y-2">
            <li>
              <Link href="/methodology" className="hover:underline hover:underline-offset-4">
                Methodology and limitations
              </Link>
            </li>
            <li>
              <Link href="/methodology#missing" className="hover:underline hover:underline-offset-4">
                How missing data is shown
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="hover:underline hover:underline-offset-4">
                Advanced dashboard and time machine
              </Link>
            </li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}
