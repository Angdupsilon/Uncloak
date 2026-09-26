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
      {/* ≥1280: wordmark · centred links · search + buttons.
          1024–1279: links stay on one line; header search and Sources hide (Search is a link).
          <1024: wordmark + button on top, links in one scrollable row underneath. */}
      <div className="flex min-h-16 w-full flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 sm:px-8 xl:gap-x-8">
        <Link href="/" className="shrink-0" aria-label="Uncloak home">
          <span className="gs-wordmark text-[30px] font-bold leading-10 tracking-[-1.2px] text-black sm:text-[34px] sm:tracking-[-1.4px]">Uncloak</span>
        </Link>
        <nav aria-label="Main" className="order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-8 sm:w-[calc(100%+4rem)] sm:px-8 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:overflow-visible lg:px-0">
          <ul className="flex items-center gap-x-5 whitespace-nowrap text-[15px] font-medium text-[var(--ink-soft)] lg:justify-center lg:gap-x-6 xl:gap-x-9">
            {NAV.map((n) => (
              <li key={n.href} className="shrink-0">
                <Link href={n.href} className="inline-block py-2 hover:underline hover:underline-offset-4">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {search ? (
            <div className="hidden w-[260px] xl:block">
              <SearchBox size="sm" defaultValue={query} placeholder="Search Google, Abilene…" />
            </div>
          ) : (
            <Link
              href="/methodology#sources"
              className="hidden h-10 items-center rounded-lg bg-[#eef0f3] px-4 text-[15px] font-medium text-black hover:bg-[#e2e5ea] xl:inline-flex"
            >
              Sources
            </Link>
          )}
          <Link href="/dashboard" className="inline-flex h-10 items-center whitespace-nowrap rounded-lg bg-[#1f1f1f] px-4 text-[15px] font-medium text-white hover:bg-black">
            <span className="xl:hidden">Dashboard</span>
            <span className="hidden xl:inline">Advanced dashboard</span>
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
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Uncloak home">
            <svg aria-hidden viewBox="0 0 256 256" className="h-7 w-7 fill-current">
              <path d="M121 19c4.3-2.6 9.7-2.6 14 0l87 53c6 3.7 9 8.5 9 16 0 19-2.3 39-10 57l26 16c5.3 3.2 5.3 8 0 11l-112 69c-4.3 2.6-9.7 2.6-14 0L9 172c-5.3-3.2-5.3-8 0-11l39-24c3.2-2 6.4-2 9.7 0l88 53c10 6 17 4 25-2 31-24 49-62 51-91 .5-9-2-11-9-8-31 13-53 39-72 66-5 7-10 9-17 5L9 90c-5.3-3.2-5.3-8 0-11l112-60Z" />
            </svg>
            <span className="gs-wordmark text-[30px] font-bold tracking-[-1.2px]">Uncloak</span>
          </Link>
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
