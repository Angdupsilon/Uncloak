"use client";
// WAI-ARIA tabs with automatic activation: ←/→ move between tabs, Home/End jump.
// Panels are server-rendered and passed in, so all content is in the HTML.
import { useId, useRef, useState, type ReactNode } from "react";

export default function Tabs({ tabs, label }: { tabs: { id: string; label: string; content: ReactNode }[]; label: string }) {
  const base = useId();
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const focus = (i: number) => {
    const n = (i + tabs.length) % tabs.length;
    setActive(n);
    refs.current[n]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-[var(--hairline)]">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={i === active}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") focus(active + 1);
              else if (e.key === "ArrowLeft") focus(active - 1);
              else if (e.key === "Home") focus(0);
              else if (e.key === "End") focus(tabs.length - 1);
              else return;
              e.preventDefault();
            }}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-[14px] font-medium transition-colors ${
              i === active ? "border-black text-black" : "border-transparent text-[var(--body)] hover:text-black"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={i !== active}
          tabIndex={0}
          className="pt-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
