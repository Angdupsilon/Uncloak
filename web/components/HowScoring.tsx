"use client";
import { useState } from "react";
import { fmtDate, fmtPct, fmtUSD } from "@/lib/format";
import type { ScoringConfig } from "@/lib/types";

export default function HowScoring({ config }: { config: ScoringConfig | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="shrink-0 rounded-lg border border-[var(--border-strong)] bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-[var(--shadow-1)] transition-colors hover:bg-slate-50">
        How scoring works
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[1200] mt-2 w-[440px] rounded-xl border border-[var(--border-soft)] bg-white p-5 text-xs shadow-[0_20px_40px_-12px_rgb(16_24_40/0.22)]">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="text-sm font-semibold">Evidence index (uncalibrated)</div>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
              ×
            </button>
          </div>
          {!config || config.factors.length === 0 ? (
            <div className="text-slate-500">Scoring config not found. Run the ETL backfill (etl/run_all.py).</div>
          ) : (
            <>
              <p className="mb-2 text-slate-600">
                Each project earns checklist points from dated public-record evidence on or before the selected date. Evidence score = points ÷ {config.factors.reduce((sum, f) => sum + f.points, 0)} (max points). It is a transparent
                checklist, not a calibrated probability.
              </p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1 font-medium">Factor</th>
                    <th className="py-1 text-right font-medium">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {config.factors.map((f) => (
                    <tr key={f.key} className="border-b border-slate-100">
                      <td className="py-1">
                        <div className="text-slate-800">{f.rule}</div>
                        <div className="font-mono text-[10px] text-slate-400">{f.key}</div>
                      </td>
                      <td className="py-1 text-right tabular-nums">{f.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 space-y-1 text-slate-600">
                <div>
                  <span className="font-medium text-slate-800">Estimated MW</span> = total registered construction cost ÷{" "}
                  {config.mw_cost_per_mw_usd != null ? (
                    <>
                      <span className="font-semibold">{fmtUSD(config.mw_cost_per_mw_usd)} per MW</span>
                      {config.mw_cost_source && config.mw_cost_source !== "env" &&
                        (/sample/i.test(config.mw_cost_source) ? (
                          <span className="ml-1 rounded bg-yellow-200 px-1 font-semibold text-yellow-900">{config.mw_cost_source}</span>
                        ) : (
                          <span className="block text-[11px] text-slate-500">Source: {config.mw_cost_source}</span>
                        ))}
                    </>
                  ) : (
                    <span className="font-semibold text-amber-700">not configured (MW_COST_PER_MW_USD)</span>
                  )}
                </div>
                <div>
                  <span className="font-medium text-slate-800">Tiers:</span> verified ≥ {fmtPct(config.tier_thresholds.verified)}, likely ≥{" "}
                  {fmtPct(config.tier_thresholds.likely)}, otherwise low.
                </div>
                <div>
                  <span className="font-medium text-slate-800">Evidence-weighted demand</span> = Σ evidence score × estimated MW.
                </div>
                <div className="text-slate-400">
                  Weekly backfill from {fmtDate(config.backfill_start)} · last computed {fmtDate(config.computed_at)}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
