import { connection } from "next/server";
import type { Metadata } from "next";
import SearchBox from "@/components/public/SearchBox";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import { Container, EmptyState } from "@/components/public/ui";
import { askGridSight } from "@/lib/gemini";
import { todayUtc } from "@/lib/queries";

export const metadata: Metadata = { title: "Ask Uncloak" };

export default async function AskPage(props: PageProps<"/ask">) {
  await connection();
  const raw = (await props.searchParams).q;
  const question = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 500) ?? "";
  const result = question ? await askGridSight(question, todayUtc()) : null;

  return (
    <>
      <SiteHeader search={false} />
      <main id="main">
        <Container className="py-12">
          <p className="ub-eyebrow">Ask Uncloak</p>
          <h1 className="rw-display-sm mt-3">Answers from the records</h1>
          <p className="mt-3 max-w-2xl text-[17px] leading-7 text-[var(--body)]">
            Ask about data-center projects and companies across the U.S., Texas permits, or the ERCOT queue. Answers use only the public-record data behind Uncloak.
          </p>
          <div className="mt-8 max-w-3xl">
            <SearchBox size="lg" defaultValue={question} placeholder="Ask a question about U.S. data centers…" />
          </div>

          {!result ? (
            <div className="mt-12">
              <EmptyState title="Ask a question">For example: “Which projects around Dallas look least certain?”</EmptyState>
            </div>
          ) : (
            <section className="mt-12 max-w-3xl rounded-xl border border-[var(--hairline)] bg-white p-6 shadow-[var(--shadow-card)]" aria-labelledby="answer-h">
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
          )}
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
