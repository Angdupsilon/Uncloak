import Link from "next/link";
import SearchBox from "@/components/public/SearchBox";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import { Container } from "@/components/public/ui";

export default function NotFound() {
  return (
    <div className="rw flex min-h-full flex-1 flex-col bg-white">
      <SiteHeader search={false} />
      <main id="main" className="flex-1">
        <Container className="py-20">
          <p className="ub-eyebrow">Not found</p>
          <h1 className="rw-display-sm mt-3">We couldn&apos;t find that page</h1>
          <p className="rw-subtitle mt-5 max-w-2xl">
            The organization or site may have been renamed or merged when the records were refreshed. Try searching for it.
          </p>
          <div className="mt-8 max-w-3xl">
            <SearchBox size="lg" />
          </div>
          <p className="mt-6">
            <Link href="/" className="rw-link">
              Back to the homepage
            </Link>
          </p>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
