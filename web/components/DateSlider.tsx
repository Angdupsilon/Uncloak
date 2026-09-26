"use client";
import { useEffect, useMemo, useState } from "react";
import { UI } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Weekly steps (Mondays) from start to end, always ending on `end`. */
function weeklySteps(start: string, end: string): string[] {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || s > e) return [end];
  const dow = new Date(s).getUTCDay(); // Sunday = 0 … Monday = 1
  let t = s + ((8 - dow) % 7) * DAY_MS;
  const out: string[] = [];
  for (; t <= e; t += 7 * DAY_MS) out.push(iso(t));
  if (out.at(-1) !== end) out.push(end);
  return out;
}

export default function DateSlider({
  start,
  end,
  value,
  onChange,
}: {
  start: string | null;
  end: string;
  value: string;
  onChange: (asOf: string) => void;
}) {
  const steps = useMemo(() => weeklySteps(start ?? end, end), [start, end]);
  const [playing, setPlaying] = useState(false);
  const idx = Math.max(0, steps.findLastIndex((d) => d <= value));
  const atEnd = idx >= steps.length - 1;
  const isPlaying = playing && !atEnd;

  // Advance one week per tick while playing; stops by itself at the last step.
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(() => onChange(steps[idx + 1]), UI.playStepMs);
    return () => clearTimeout(timer);
  }, [isPlaying, idx, steps, onChange]);

  const togglePlay = () => {
    if (isPlaying) return setPlaying(false);
    if (atEnd) onChange(steps[0]);
    setPlaying(true);
  };

  return (
    <div className="flex min-w-[400px] flex-1 items-center gap-3">
      <button
        onClick={togglePlay}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white transition-colors hover:bg-[#282828]"
        aria-label={isPlaying ? "Pause" : "Play weekly"}
        title={isPlaying ? "Pause" : "Play: step weekly through time"}
      >
        {isPlaying ? "❚❚" : "▶"}
      </button>
      <div className="min-w-0 flex-1">
        {/* justify-between alone lets these run together on a narrow footer.
            The centre readout is the one value that must stay legible, so it
            never shrinks; the range endpoints truncate instead. */}
        <div className="ub-caption mb-0.5 flex items-baseline justify-between gap-4 text-[#afafaf]">
          <span className="whitespace-nowrap">{fmtDate(steps[0])}</span>
          <span className="ub-body-md-strong shrink-0 whitespace-nowrap text-black">As of {fmtDate(value)}</span>
          <span className="whitespace-nowrap">{fmtDate(steps.at(-1))}</span>
        </div>
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={idx}
          onChange={(e) => {
            setPlaying(false);
            onChange(steps[Number(e.target.value)]);
          }}
          className="w-full"
          aria-label="As-of date"
        />
      </div>
    </div>
  );
}
