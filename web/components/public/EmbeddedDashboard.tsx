"use client";
// The advanced dashboard, filtered to one organization, inside its public profile.
// It needs a wide screen (≥1024px); narrower screens get a link to the full-page version.
import Link from "next/link";
import { Component, useSyncExternalStore, type ReactNode } from "react";
import Dashboard from "@/components/Dashboard";

const QUERY = "(min-width: 1024px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** If the dashboard fails, the rest of the profile stays up. */
class DashboardBoundary extends Component<{ href: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[uncloak dashboard embed]", err);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="rounded-lg bg-[#f7f8fa] p-6 text-[15px] text-[#404040]">
        The interactive dashboard couldn&apos;t load here.{" "}
        <Link href={this.props.href} className="rw-link">
          Open it full-page
        </Link>
      </div>
    );
  }
}

export default function EmbeddedDashboard({ today, parent, href }: { today: string; parent: string; href: string }) {
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => null as boolean | null,
  );

  if (wide === null) return <div className="h-[780px] animate-pulse rounded-lg bg-[#f7f8fa]" aria-hidden />;
  if (!wide) {
    return (
      <div className="rounded-lg bg-[#f7f8fa] p-6 text-[15px] text-[#404040]">
        The interactive dashboard needs a wider screen.{" "}
        <Link href={href} className="rw-link">
          Open it full-page
        </Link>
      </div>
    );
  }
  return (
    <DashboardBoundary href={href}>
      <div className="overflow-x-auto">
        <Dashboard today={today} initialParent={parent} embedded />
      </div>
    </DashboardBoundary>
  );
}
