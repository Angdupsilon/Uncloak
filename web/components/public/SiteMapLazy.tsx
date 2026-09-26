"use client";
import { Component, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { SiteMapProps } from "./SiteMap";

// Leaflet touches `window`, so the map renders client-side only.
const SiteMap = dynamic(() => import("./SiteMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-[#efefef]" aria-hidden />,
});

/** A map failure must never take the rest of a profile down with it. */
export class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[gridsight map]", err);
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="grid h-full w-full place-items-center rounded-lg bg-[#f7f8fa] p-6 text-center text-[14px] text-[#404040]">
          The map couldn&apos;t load in this browser. The list shows every site and its location.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function SiteMapLazy(props: SiteMapProps) {
  return (
    <MapBoundary>
      <SiteMap {...props} />
    </MapBoundary>
  );
}
export type { MapPoint } from "./SiteMap";
