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
        className="fixed bottom-5 right-6 z-[1100] rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-700"
      >
        ✦ Ask GridSight
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-6 z-[1100] flex h-[480px] w-[380px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-slate-900 px-4 py-2.5 text-white">
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
              <button key={q} onClick={() => ask(q)} className="block w-full rounded-md border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50">
                {q}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left ${m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"}`}>
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
        className="flex gap-2 border-t border-slate-200 p-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about projects, parents, ERCOT…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <button disabled={busy || !input.trim()} className="rounded-md bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-40">
          Ask
        </button>
      </form>
    </div>
  );
}
