"use client";
import { useRef, useState } from "react";
import type { AskResponse } from "@/lib/types";

const EXAMPLES = [
  "Which projects around Dallas look least certain?",
  "Show projects worth more than $1 billion that don't have environmental permits.",
  "Who is behind Alamo Mission LLC?",
  "How much of ERCOT's queue can we actually find?",
  "Show me the history of Stargate Shackelford.",
];

interface Msg {
  role: "user" | "assistant";
  text: string;
  tools?: AskResponse["tool_calls"];
  matched?: number | null;
}

export default function AskGridSight({ asOf, onResult }: { asOf: string; onResult: (r: AskResponse) => void }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, as_of: asOf }),
      });
      const data = (await r.json()) as AskResponse;
      setMsgs((m) => [...m, { role: "assistant", text: data.answer, tools: data.tool_calls, matched: data.map_filter?.ids.length ?? null }]);
      onResult(data);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="ub-pill fixed bottom-6 right-6 z-[1100] bg-black/80 backdrop-blur-md"
      >
        ✦ Ask GridSight
      </button>
    );
  }

  return (
    <div className="ub-card fixed bottom-6 right-6 z-[1100] flex h-[480px] w-[380px] flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-float)]">
      <div className="flex items-center justify-between border-b border-[#e2e2e2] px-4 py-3 text-black">
        <div className="ub-body-md-strong">Ask GridSight</div>
        <button onClick={() => setOpen(false)} className="text-lg leading-none text-[#afafaf] hover:text-black" aria-label="Collapse">
          –
        </button>
      </div>
      <div ref={listRef} className="ub-body-sm flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <div className="text-xs text-[#5e5e5e]">
              Answers come only from GridSight&apos;s database as of the selected date. Try:
            </div>
            {EXAMPLES.map((q) => (
              <button key={q} onClick={() => ask(q)} className="block w-full rounded-lg border border-[#e2e2e2] px-3 py-2 text-left text-xs text-black transition-colors hover:border-[#e2e2e2] hover:bg-[#efefef]">
                {q}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left leading-relaxed ${m.role === "user" ? "rounded-br-md bg-black text-white" : "rounded-bl-md bg-[#efefef] text-black"}`}>
              {m.text}
            </div>
            {m.tools && m.tools.length > 0 && (
              <div className="mt-1 font-mono text-[10px] text-[#afafaf]">
                {m.tools.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join(" → ")}
              </div>
            )}
            {m.matched != null && <div className="text-[11px] text-[#5e5e5e]">Map filtered to {m.matched} project(s)</div>}
          </div>
        ))}
        {busy && <div className="text-xs text-[#afafaf]">Thinking…</div>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2 border-t border-[#e2e2e2] p-2.5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about projects, parents, ERCOT…"
          className="flex-1 rounded-2xl border border-[#e2e2e2] bg-transparent px-3 py-2 text-sm text-black outline-none transition-colors placeholder:text-[#afafaf] focus:border-black"
        />
        <button disabled={busy || !input.trim()} className="ub-pill !px-5 disabled:opacity-35">
          Ask
        </button>
      </form>
    </div>
  );
}
