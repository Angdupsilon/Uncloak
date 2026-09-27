"use client";
// Global search: a WAI-ARIA 1.2 combobox with a listbox popup.
// Keys: ↓/↑ move, Enter opens the active result (or the full results page), Esc closes then clears.
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { SearchHit, SearchKind } from "@/lib/types";

const KIND_LABEL: Record<SearchKind, string> = {
  org: "Organization",
  site: "Site",
  entity: "Registered entity",
  city: "City",
  county: "County",
  zip: "ZIP code",
  place: "Place",
};

const KIND_STYLE: Record<SearchKind, string> = {
  org: "bg-black text-white",
  site: "bg-white text-black ring-1 ring-inset ring-black",
  entity: "bg-white text-[#404040] ring-1 ring-inset ring-[#c9ccd1]",
  city: "bg-[#e7eaf0] text-black",
  county: "bg-[#e7eaf0] text-black",
  zip: "bg-[#e7eaf0] text-black",
  place: "bg-[#e7eaf0] text-[#404040]",
};

/**
 * Keep named places, companies, and addresses in the record finder. Everything
 * that reads like an analysis request is handed to Ask Uncloak instead.
 */
export function isAnalyticalQuery(value: string): boolean {
  const query = value.trim();
  if (!query) return false;
  const words = query.replace(/[?!]+$/, "").trim().split(/\s+/).filter(Boolean);

  return (
    (/\?$/.test(query) && words.length > 1) ||
    /^(?:who|what|when|where|why|how|which|show|find|compare|list|is|are|does|do|can|could|should|tell me|give me|explain)\b/i.test(query) ||
    /\b(?:largest|smallest|most|least|growth|growing|built|building|projects?|permits?|queue|ercot|evidence score|evidence scores|phantom load|shadow load)\b/i.test(query)
  );
}

export function KindChip({ kind }: { kind: SearchKind }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLE[kind]}`}>
      {KIND_LABEL[kind]}
    </span>
  );
}

export default function SearchBox({
  size = "lg",
  defaultValue = "",
  placeholder = "Search a company, place or address, or ask a question",
  showSubmitButton = true,
}: {
  size?: "lg" | "sm";
  defaultValue?: string;
  placeholder?: string;
  /** Header search keeps the finder compact; Enter still submits the form. */
  showSubmitButton?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const [q, setQ] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Results are stored with the term they answer; anything else is still loading.
  const [res, setRes] = useState<{ term: string; hits: SearchHit[]; error: string | null }>({ term: "", hits: [], error: null });
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const term = q.trim();
  // A trailing question mark is common for a company lookup ("Google?"). It
  // should not prevent the record search from recognizing the company name.
  const lookupTerm = term.replace(/[?!]+$/, "").trim();
  const ready = lookupTerm.length >= 2;
  const loading = ready && res.term !== lookupTerm;
  const hits = ready && !loading ? res.hits : [];
  const error = ready && !loading ? res.error : null;
  // A direct result is stronger evidence of lookup intent than wording alone:
  // "Google?" should still open Google's record, not an analyst answer.
  const hasRecordMatch = hits.some((hit) => hit.kind !== "place" && hit.kind !== "zip");
  const askGemini = isAnalyticalQuery(term) && !hasRecordMatch;
  // A generic "near this text" suggestion is useful for lookups, but misleading
  // for prose questions. Hide it while offering the analyst handoff instead.
  const suggestionHits = askGemini ? [] : hits;

  // Debounced fetch; stale requests are aborted. State is only set from async callbacks.
  useEffect(() => {
    if (lookupTerm.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(lookupTerm)}`, { signal: ac.signal })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error ?? r.statusText);
          setRes({ term: lookupTerm, hits: body.hits ?? [], error: null });
          setActive(-1);
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setRes({ term: lookupTerm, hits: [], error: "Search is unavailable right now." });
        });
    }, 160);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [lookupTerm]);

  // Close when focus or a click leaves the widget.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    router.push(hit.href);
  };

  const submit = () => {
    if (active >= 0 && suggestionHits[active]) return go(suggestionHits[active]);
    if (term) {
      setOpen(false);
      router.push(`${askGemini ? "/ask" : "/search"}?q=${encodeURIComponent(askGemini ? term : lookupTerm)}`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (suggestionHits.length ? (a + 1) % suggestionHits.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (suggestionHits.length ? (a <= 0 ? suggestionHits.length - 1 : a - 1) : -1));
    } else if (e.key === "Escape") {
      if (open) setOpen(false);
      else setQ("");
      setActive(-1);
    } else if (e.key === "Home" && open && suggestionHits.length) {
      setActive(0);
    } else if (e.key === "End" && open && suggestionHits.length) {
      setActive(suggestionHits.length - 1);
    }
  };

  const showList = open && ready;
  const lg = size === "lg";
  const activeId = active >= 0 ? `${id}-opt-${active}` : undefined;

  return (
    <div ref={wrapRef} className="relative w-full">
      <form
        role="search"
        aria-label="Search Uncloak"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-white shadow-[var(--shadow-card)] focus-within:border-black focus-within:ring-2 focus-within:ring-black/10 ${
          lg ? "py-2 pl-5 pr-2" : "py-1 pl-4 pr-1"
        }`}
      >
        <svg aria-hidden viewBox="0 0 20 20" className={`${lg ? "h-5 w-5" : "h-4 w-4"} shrink-0 text-slate-500`} fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="9" cy="9" r="6" />
          <path d="m13.5 13.5 4 4" strokeLinecap="round" />
        </svg>
        <label htmlFor={`${id}-input`} className="sr-only">
          Search organizations, sites, entities and places, or ask a question about U.S. data centers
        </label>
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? activeId : undefined}
          autoComplete="off"
          spellCheck={false}
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`ub-search-input min-w-0 flex-1 bg-transparent text-black placeholder:text-slate-400 ${lg ? "py-2 text-[17px]" : "py-1.5 text-[14px]"}`}
        />
        {loading && <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-black" />}
        {showSubmitButton && (
          <button type="submit" className={lg ? "ub-pill" : "ub-pill !px-4 !py-2 !text-[14px]"}>
            Search
          </button>
        )}
      </form>

      <div aria-live="polite" className="sr-only">
        {showList && !loading ? (error ?? `${askGemini ? 1 : suggestionHits.length} result${askGemini || suggestionHits.length === 1 ? "" : "s"} available`) : ""}
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label="Search suggestions"
        hidden={!showList}
        className="absolute left-0 right-0 top-full z-[2000] mt-2 max-h-[min(70vh,480px)] overflow-y-auto rounded-lg border border-[var(--hairline)] bg-white py-2 text-left shadow-[var(--shadow-float)]"
      >
        {error && <li className="px-4 py-3 text-[14px] text-red-700">{error}</li>}
        {!error && !loading && askGemini && (
          <li
            role="option"
            aria-selected={active === 0}
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            className={`flex cursor-pointer items-start gap-3 px-4 py-3 ${active === 0 ? "bg-[var(--canvas-soft)]" : ""}`}
          >
            <span className="inline-flex shrink-0 items-center rounded-full bg-black px-2 py-0.5 text-[11px] font-semibold text-white">Ask</span>
            <span className="min-w-0">
              <span className="block text-[15px] font-medium text-black">Ask Uncloak</span>
              <span className="block text-[13px] text-slate-600">Analyze this question from the data-center records</span>
            </span>
          </li>
        )}
        {!error && !loading && suggestionHits.length === 0 && !askGemini && (
          <li className="px-4 py-3 text-[14px] text-slate-600">No matches yet. Keep typing, or press Enter to search.</li>
        )}
        {suggestionHits.map((h, i) => (
          <li
            key={`${h.kind}-${h.href}-${i}`}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => go(h)}
            className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 ${i === active ? "bg-[var(--canvas-soft)]" : ""}`}
          >
            <KindChip kind={h.kind} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium text-black">
                {h.label}
                {h.is_sample && <span className="ml-2 text-[11px] font-semibold uppercase text-amber-700">Sample</span>}
              </span>
              <span className="block truncate text-[13px] text-slate-600">{h.sublabel}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
