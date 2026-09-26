"use client";
import { useState } from "react";
import QueueTimeline from "@/components/QueueTimeline";
import type { QueueTimeline as QueueTimelineData } from "@/lib/types";

/** Queue Timeline tab: the full history, with a clickable week cursor kept in local state. */
export default function QueueTimelineView({ data, today }: { data: QueueTimelineData; today: string }) {
  const [asOf, setAsOf] = useState(today);
  return <QueueTimeline variant="page" data={data} error={null} asOf={asOf} today={today} onPick={setAsOf} />;
}
