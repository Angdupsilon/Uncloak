"use client";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TIER_COLORS, TIER_THRESHOLDS } from "@/lib/constants";
import { fmtDate, fmtMW, fmtMonth, fmtPct, summarizeEvents } from "@/lib/format";
import type { EvidenceEvent, ScorePoint } from "@/lib/types";

interface Point {
  t: number;
  ts: string;
  probability: number;
  mw_est: number | null;
  added: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Attach each event to the first score step that includes it (a score dated D covers evidence on or before D). */
function buildPoints(scores: ScorePoint[], events: EvidenceEvent[]): Point[] {
  const buckets = new Map<number, EvidenceEvent[]>();
  let i = 0;
  const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  for (const e of sorted) {
    const et = Date.parse(e.ts);
    while (i < scores.length && Date.parse(scores[i].ts) + DAY_MS <= et) i++;
    if (i >= scores.length) break;
    const key = Date.parse(scores[i].ts);
    buckets.set(key, [...(buckets.get(key) ?? []), e]);
  }
  return scores.map((s) => {
    const t = Date.parse(s.ts);
    return { t, ts: s.ts, probability: s.probability, mw_est: s.mw_est, added: summarizeEvents(buckets.get(t) ?? []) };
  });
}

function EventDot(props: { cx?: number; cy?: number; payload?: Point }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload?.added.length) return <g />;
  return <circle cx={cx} cy={cy} r={4.5} fill="#0f172a" stroke="#fff" strokeWidth={1.5} />;
}

function TipContent({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="max-w-[240px] rounded-md border border-[#e2e2e2] bg-white px-3 py-2 text-xs shadow">
      <div className="font-semibold">{fmtDate(p.ts)}</div>
      <div>
        Evidence score {fmtPct(p.probability)} · {fmtMW(p.mw_est)}
      </div>
      {p.added.map((line) => (
        <div key={line} className="text-black">
          {line}
        </div>
      ))}
    </div>
  );
}

export default function TimeMachine({ scores, events }: { scores: ScorePoint[]; events: EvidenceEvent[] }) {
  if (!scores.length) {
    return <div className="rounded-md bg-black px-3 py-6 text-center text-xs text-[#5e5e5e]">No score history on or before this date.</div>;
  }
  const data = buildPoints(scores, events);
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#f1f5f9" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={fmtMonth}
            tick={{ fontSize: 10 }}
            minTickGap={24}
          />
          <YAxis domain={[0, 1]} tickFormatter={(v) => fmtPct(v)} tick={{ fontSize: 10 }} width={44} />
          <ReferenceLine y={TIER_THRESHOLDS.verified} stroke={TIER_COLORS.verified} strokeDasharray="3 3" />
          <ReferenceLine y={TIER_THRESHOLDS.likely} stroke={TIER_COLORS.likely} strokeDasharray="3 3" />
          <Tooltip content={<TipContent />} />
          <Line
            dataKey="probability"
            type="stepAfter"
            stroke="#334155"
            strokeWidth={2}
            dot={<EventDot />}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
