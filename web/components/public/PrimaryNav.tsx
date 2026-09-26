"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type NavItem = { href: string; label: string; description: string };

const EXPLORE: NavItem[] = [
  { href: "/org", label: "Organizations", description: "Companies linked to Texas data-center sites" },
  { href: "/near", label: "Near me", description: "Find recorded sites around a place" },
  { href: "/search", label: "Search", description: "Search places, companies, and sites" },
];

const MARKET_INTELLIGENCE: NavItem[] = [
  { href: "/queue", label: "Queue Timeline", description: "Track requested, approved, and energized ERCOT load" },
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
  const hasCurrentItem = items.some((item) => isCurrent(pathname, item.href));

  useEffect(() => {
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
    <li ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1 rounded-md py-2 hover:underline hover:underline-offset-4 ${hasCurrentItem ? "text-black" : ""}`}
      >
        {label}
        <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m2.5 4.5 3.5 3 3.5-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full z-[2000] mt-2 w-80 rounded-xl border border-[var(--hairline)] bg-white p-2 shadow-[var(--shadow-float)]"
        >
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
      )}
    </li>
  );
}

export default function PrimaryNav() {
  const pathname = usePathname();
  const methodologyCurrent = isCurrent(pathname, "/methodology");

  return (
    <nav aria-label="Main" className="order-3 -mx-4 w-[calc(100%+2rem)] px-4 sm:-mx-8 sm:w-[calc(100%+4rem)] sm:px-8 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:px-0">
      <ul className="flex flex-wrap items-center gap-x-5 text-[15px] font-medium text-[var(--ink-soft)] lg:justify-center lg:gap-x-6 xl:gap-x-9">
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
