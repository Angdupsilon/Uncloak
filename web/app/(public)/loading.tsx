import { Container } from "@/components/public/ui";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex-1">
      <span className="sr-only">Loading records…</span>
      <div className="h-16 border-b border-[var(--hairline)]" />
      <Container className="animate-pulse py-12" aria-hidden>
        <div className="h-4 w-28 rounded bg-[var(--canvas-soft)]" />
        <div className="mt-4 h-11 w-2/3 rounded bg-[var(--canvas-soft)]" />
        <div className="mt-6 h-5 w-1/2 rounded bg-[var(--canvas-soft)]" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-lg bg-[var(--canvas-softer)]" />
          ))}
        </div>
      </Container>
    </div>
  );
}
