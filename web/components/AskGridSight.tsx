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
        className="fixed bottom-6 right-6 z-[1100] rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-[var(--shadow-2)] transition-all hover:-translate-y-0.5 hover:bg-slate-800"
      >
        ✦ Ask GridSight
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[1100] flex h-[480px] w-[380px] flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-white shadow-[0_20px_40px_-12px_rgb(16_24_40/0.22)]">
      <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
        <div className="text-sm font-semibold">✦ Ask GridSight</div>
        <button onClick={() => setOpen(false)} className="text-lg leading-none text-slate-300 hover:text-white" aria-label="Collapse">
          –
        </button>
      </div>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500">
              Answers come only from GridSight&apos;s database as of the selected date. Try:
            </div>
            {EXAMPLES.map((q) => (
              <button key={q} onClick={() => ask(q)} className="block w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:border-[var(--border-strong)] hover:bg-slate-50">
                {q}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left leading-relaxed ${m.role === "user" ? "rounded-br-md bg-slate-900 text-white" : "rounded-bl-md bg-slate-100 text-slate-900"}`}>
              {m.text}
            </div>
            {m.tools && m.tools.length > 0 && (
              <div className="mt-1 font-mono text-[10px] text-slate-400">
                {m.tools.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join(" → ")}
              </div>
            )}
            {m.matched != null && <div className="text-[11px] text-sky-700">Map filtered to {m.matched} project(s)</div>}
          </div>
        ))}
        {busy && <div className="text-xs text-slate-400">Thinking…</div>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2 border-t border-[var(--border-soft)] p-2.5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about projects, parents, ERCOT…"
          className="flex-1 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-teal-600"
        />
        <button disabled={busy || !input.trim()} className="rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-35">
          Ask
        </button>
      </form>
    </div>
  );
}
