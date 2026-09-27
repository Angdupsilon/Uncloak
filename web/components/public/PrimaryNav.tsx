"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import SearchBox from "./SearchBox";
import { PAGE_WIDTH } from "./ui";

type NavItem = { href: string; label: string; description: string };

const EXPLORE: NavItem[] = [
  { href: "/org", label: "Organizations", description: "Companies linked to data-center sites" },
  { href: "/near", label: "Near me", description: "Find recorded sites around a place" },
  { href: "/search", label: "Search", description: "Search places, companies, and sites" },
];

const MARKET_INTELLIGENCE: NavItem[] = [
  { href: "/queue", label: "Queue Timeline", description: "ERCOT's large-load queue, plus Georgia Power and PJM load reports" },
  { href: "/spare-capacity", label: "Spare capacity", description: "Find existing connections with room for a new load" },
];

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Menu({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLLIElement>(null);
  const hoverCapable = useRef(false);
  const hasCurrentItem = items.some((item) => isCurrent(pathname, item.href));

  useEffect(() => {
    hoverCapable.current = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const closeWhenOutside = (event: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    document.addEventListener("touchstart", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenOutside);
      document.removeEventListener("touchstart", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <li
      ref={root}
      className="relative shrink-0"
      onMouseEnter={() => {
        if (hoverCapable.current) setOpen(true);
      }}
      onMouseLeave={() => {
        if (hoverCapable.current) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (!hoverCapable.current) setOpen((value) => !value);
        }}
        onFocus={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-md py-2 hover:underline hover:underline-offset-4 ${hasCurrentItem ? "text-black" : ""}`}
      >
        {label}
        <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m2.5 4.5 3.5 3 3.5-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className="absolute left-0 top-full z-[2000] pt-2">
          <div className="w-80 rounded-xl border border-[var(--hairline)] bg-white p-2 shadow-[var(--shadow-float)]">
            {items.map((item) => {
              const current = isCurrent(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  aria-current={current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-3 py-2.5 hover:bg-[var(--canvas-softer)] ${current ? "bg-[var(--canvas-softer)]" : ""}`}
                >
                  <span className="block text-[14px] font-medium text-black">{item.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-[var(--slate)]">{item.description}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
}

export default function PrimaryNav() {
  const pathname = usePathname();
  const methodologyCurrent = isCurrent(pathname, "/methodology");

  return (
    <nav aria-label="Main" className="hidden lg:block lg:flex-1">
      <ul className="flex items-center justify-center gap-x-6 text-[15px] font-medium text-[var(--ink-soft)] xl:gap-x-9">
        <Menu label="Explore" items={EXPLORE} />
        <Menu label="Market intelligence" items={MARKET_INTELLIGENCE} />
        <li className="shrink-0">
          <Link
            href="/methodology"
            aria-current={methodologyCurrent ? "page" : undefined}
            className={`inline-block py-2 hover:underline hover:underline-offset-4 ${methodologyCurrent ? "text-black" : ""}`}
          >
            Methodology
          </Link>
        </li>
      </ul>
    </nav>
  );
}

const MOBILE_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Explore", items: EXPLORE },
  { label: "Market intelligence", items: MARKET_INTELLIGENCE },
  {
    label: "Understand the data",
    items: [
      { href: "/methodology", label: "Methodology", description: "How every figure is sourced, linked and estimated" },
      { href: "/dashboard", label: "Advanced dashboard", description: "Map, time machine and filters" },
    ],
  },
];

/** Below 1024px: a menu button that opens every destination as a full-screen sheet. */
export function MobileNav({ search = true, query = "" }: { search?: boolean; query?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const sheetId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Following a link or submitting a search closes the sheet.
  if (open && openedAt !== pathname) {
    setOpen(false);
  }

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    // The sheet covers the page, so the page behind it shouldn't scroll.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The sheet is only for narrow screens; widening the window past 1024px closes it.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const onChange = () => wide.matches && setOpen(false);
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="lg:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={sheetId}
        aria-label="Open menu"
        onClick={() => {
          setOpenedAt(pathname);
          setOpen(true);
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-black hover:bg-[var(--canvas-softer)]"
      >
        <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <path d="M3 6h14M3 10h14M3 14h14" />
        </svg>
      </button>
      {open && (
        <div id={sheetId} role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-[2200] flex flex-col bg-white">
          <div className={`${PAGE_WIDTH} flex h-16 shrink-0 items-center justify-between sm:h-[72px]`}>
            <Link href="/" onClick={close} aria-label="Uncloak home" className="gs-wordmark text-[28px] font-bold leading-10 tracking-[-1.1px] text-black sm:text-[34px] sm:tracking-[-1.4px]">
              Uncloak
            </Link>
            <button
              ref={closeButton}
              type="button"
              aria-label="Close menu"
              onClick={close}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-black hover:bg-[var(--canvas-softer)]"
            >
              <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
          </div>
          <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto border-t border-[var(--hairline)]">
            <div className={`${PAGE_WIDTH} pb-12 pt-5`}>
              {search && (
                <div className="mb-8" onSubmitCapture={() => setOpen(false)}>
                  <SearchBox size="sm" defaultValue={query} placeholder="Search records" />
                </div>
              )}
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                {MOBILE_GROUPS.map((group) => (
                  <section key={group.label}>
                    <h2 className="ub-eyebrow">{group.label}</h2>
                    <ul className="mt-2">
                      {group.items.map((item) => {
                        const current = isCurrent(pathname, item.href);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              aria-current={current ? "page" : undefined}
                              onClick={close}
                              className={`-mx-3 block rounded-lg px-3 py-3 hover:bg-[var(--canvas-softer)] ${current ? "bg-[var(--canvas-softer)]" : ""}`}
                            >
                              <span className="block text-[17px] font-medium text-black">{item.label}</span>
                              <span className="mt-0.5 block text-[13px] leading-5 text-[var(--slate)]">{item.description}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
