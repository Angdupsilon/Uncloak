// Wording for modeled ranges (estimates table). A modeled value is always shown as a range, labeled
// "Uncloak estimate (modeled)", with the model's backtest next to it.
import type { Estimate } from "./types";

const mw = (v: number) => (v < 1 ? "<1" : v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString());

export function fmtRange(e: Estimate): string {
  return `${mw(e.low)}–${mw(e.high)} ${e.unit}`;
}

export function estimateNote(e: Estimate): string {
  const src = e.inputs.sqft_source?.startsWith("IM3") ? "the mapped building footprint" : "the registered floor area";
  const sqft = e.inputs.sqft != null ? ` (${Math.round(e.inputs.sqft).toLocaleString()} sq ft)` : "";
  return `Middle ${mw(e.mid)} ${e.unit}, from ${src}${sqft}.`;
}

export function backtestNote(e: Estimate): string | null {
  const v = e.validation;
  if (v.median_abs_pct_error == null || v.n == null) return null;
  return `Tested by leaving out each of ${v.n} Texas data centers in turn: typical error ${Math.round(v.median_abs_pct_error)}%, and ${Math.round(
    v.interval_coverage_pct ?? 0,
  )}% of true values fell inside the range.`;
}

export const itLoad = (estimates: Estimate[] | undefined) => estimates?.find((e) => e.metric === "it_mw") ?? null;
