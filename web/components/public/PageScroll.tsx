"use client";

import { useEffect } from "react";

/** A small reduction in page travel, without adding scroll animation or inertia. */
export default function PageScroll() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const onWheel = (event: WheelEvent) => {
      if (
        event.defaultPrevented || !event.cancelable || reducedMotion.matches ||
        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ) return;

      // Leave embedded maps, controls, and independently scrolling lists native.
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".rw") || target.closest(".leaflet-container, textarea, select, input, [role='dialog']")) return;
      for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) return;
      }

      const root = document.scrollingElement;
      if (!root || /hidden|clip/.test(getComputedStyle(document.body).overflowY)) return;
      if ((event.deltaY < 0 && root.scrollTop <= 0) ||
          (event.deltaY > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight)) return;

      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? parseFloat(getComputedStyle(document.documentElement).lineHeight) || 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
      event.preventDefault();
      window.scrollBy({ top: event.deltaY * unit * 0.92, behavior: "instant" });
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  return null;
}
