import { Container } from "@/components/public/ui";

/** A route-specific fallback makes an AI request feel intentional while it streams. */
export default function AskLoading() {
  return (
    <main id="main" aria-busy="true">
      <Container className="py-12">
        <p className="ub-eyebrow">Ask Uncloak</p>
        <h1 className="rw-display-sm mt-3">Checking the public record</h1>
        <div role="status" aria-live="polite" className="mt-6 max-w-3xl rounded-xl border border-[var(--hairline)] bg-white p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[#d5d5d5] border-t-black" />
            <div>
              <p className="text-[17px] font-medium text-black">Generating an answer from the records…</p>
              <p className="mt-1 text-[14px] leading-5 text-[var(--body)]">Uncloak is checking the relevant public-record data and sources.</p>
            </div>
          </div>
          <div aria-hidden className="mt-8 animate-pulse space-y-3 border-t border-[var(--hairline)] pt-6">
            <div className="h-4 w-full rounded bg-[var(--canvas-soft)]" />
            <div className="h-4 w-5/6 rounded bg-[var(--canvas-soft)]" />
            <div className="h-4 w-2/3 rounded bg-[var(--canvas-soft)]" />
          </div>
        </div>
      </Container>
    </main>
  );
}
