"use client";
import Link from "next/link";
import { Container } from "@/components/public/ui";

// Last-resort boundary. Pages already catch database errors themselves; this covers anything else.
export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="flex-1">
      <Container className="py-20">
        <p className="ub-eyebrow">Something went wrong</p>
        <h1 className="rw-display-sm mt-3">This page didn&apos;t load</h1>
        <p className="rw-subtitle mt-5 max-w-2xl">Nothing is shown rather than showing incomplete numbers. Try again, or start a new search.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="ub-pill">
            Try again
          </button>
          <Link href="/" className="ub-pill-subtle">
            Go to search
          </Link>
        </div>
      </Container>
    </main>
  );
}
