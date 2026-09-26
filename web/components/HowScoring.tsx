"use client";
import { useState } from "react";
import { fmtDate, fmtPct, fmtUSD } from "@/lib/format";
import type { ScoringConfig } from "@/lib/types";

export default function HowScoring({ config }: { config: ScoringConfig | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="ub-pill-subtle shrink-0">
        How scoring works
      </button>
      {open && (
        <div className="ub-card absolute right-0 top-full z-[1200] mt-2 w-[440px] rounded-2xl p-5 text-xs shadow-[var(--shadow-float)]">
          <div className="mb-2 flex items-baseline justify-between">
            <div className="ub-display-sm">Evidence index</div>
            <button onClick={() => setOpen(false)} className="text-[#afafaf] hover:text-black" aria-label="Close">
              ×
            </button>
          </div>
          {!config || config.factors.length === 0 ? (
            <div className="text-[#5e5e5e]">Scoring config not found. Run the ETL backfill (etl/run_all.py).</div>
          ) : (
            <>
              <p className="mb-2 text-[#5e5e5e]">
                Each project earns checklist points from dated public-record evidence on or before the selected date. Evidence score = points ÷ {config.factors.reduce((sum, f) => sum + f.points, 0)} (max points). It is a transparent
                checklist, not a calibrated probability.
              </p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e2e2e2] text-left text-[#5e5e5e]">
                    <th className="py-1 font-medium">Factor</th>
                    <th className="py-1 text-right font-medium">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {config.factors.map((f) => (
                    <tr key={f.key} className="border-b border-[#efefef]">
                      <td className="py-1">
                        <div className="text-black">{f.rule}</div>
                        <div className="font-mono text-[10px] text-[#afafaf]">{f.key}</div>
                      </td>
                      <td className="py-1 text-right tabular-nums">{f.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 space-y-1 text-[#5e5e5e]">
                <div>
                  <span className="font-medium text-black">Estimated MW</span> = total registered construction cost ÷{" "}
                  {config.mw_cost_per_mw_usd != null ? (
                    <>
                      <span className="font-semibold">{fmtUSD(config.mw_cost_per_mw_usd)} per MW</span>
                      {config.mw_cost_source && config.mw_cost_source !== "env" && (
                        <span className="ml-1 border border-[#e2e2e2] px-1.5 py-0.5 font-semibold text-black">{config.mw_cost_source}</span>
                      )}
                    </>
                  ) : (
                    <span className="font-semibold text-amber-700">not configured (MW_COST_PER_MW_USD)</span>
                  )}
                </div>
                <div>
                  <span className="font-medium text-black">Tiers:</span> verified ≥ {fmtPct(config.tier_thresholds.verified)}, likely ≥{" "}
                  {fmtPct(config.tier_thresholds.likely)}, otherwise low.
                </div>
                <div>
                  <span className="font-medium text-black">Evidence-weighted demand</span> = Σ evidence score × estimated MW.
                </div>
                <div className="text-[#afafaf]">
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
