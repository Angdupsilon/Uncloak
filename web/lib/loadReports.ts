// Labels for load-report figures (dc_load_reports). A figure is always shown with its scope, so an
// all-large-load total or Georgia Power's combined data-center/crypto category is never read as data
// centers alone.
import type { LoadReport, LoadScope } from "./types";

export const SCOPE_LABEL: Record<LoadScope, string> = {
  data_centers: "Data centers",
  data_centers_and_crypto: "Data centers and crypto (the publisher's combined category)",
  large_loads_all: "All large loads, not only data centers",
};

export const METRIC_LABEL: Record<string, string> = {
  requested: "Requested / in the pipeline",
  approved: "Approved to energize",
  observed_peak: "Observed peak",
  committed: "Committed",
  contracted: "Under contract",
  forecast: "Forecast peak",
  forecast_adjustment: "Forecast adjustment above the model",
};

export const PUBLISHER: Record<string, string> = {
  ERCOT: "ERCOT",
  GA_PSC: "Georgia Power (Georgia PSC filings)",
  PJM: "PJM 2026 Load Forecast",
};

export const isForecast = (r: LoadReport) => r.forecast_year != null;

/** Latest figure per metric and stage (dated series only). */
export function latestFigures(rows: LoadReport[]): LoadReport[] {
  const latest = new Map<string, LoadReport>();
  for (const r of rows) {
    if (isForecast(r)) continue;
    const k = `${r.metric}|${r.stage ?? ""}`;
    const prev = latest.get(k);
    if (!prev || prev.ts < r.ts) latest.set(k, r);
  }
  const order = Object.keys(METRIC_LABEL);
  return [...latest.values()].sort((a, b) => order.indexOf(a.metric) - order.indexOf(b.metric) || (a.stage ?? "").localeCompare(b.stage ?? ""));
}

/** Forecast series from the latest report: one line per metric and stage, x = forecast year. */
export function forecastSeries(rows: LoadReport[]): { key: string; label: string; scope: LoadScope; points: { year: number; mw: number }[]; row: LoadReport }[] {
  const f = rows.filter(isForecast);
  if (!f.length) return [];
  const newest = f.reduce((m, r) => (r.ts > m ? r.ts : m), f[0].ts);
  const groups = new Map<string, LoadReport[]>();
  for (const r of f.filter((x) => x.ts === newest)) {
    const k = `${r.metric}|${r.stage ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].map(([key, rs]) => ({
    key,
    label: `${METRIC_LABEL[rs[0].metric] ?? rs[0].metric}${rs[0].stage ? ` (${rs[0].stage})` : ""}`,
    scope: rs[0].scope,
    points: rs.map((r) => ({ year: r.forecast_year!, mw: r.value_mw })).sort((a, b) => a.year - b.year),
    row: rs[0],
  }));
}

/** Dated series (x = report date), one line per metric, stage and scope, when a region has more than one
 *  report. A publisher that changes its category (Georgia Power's "Data Center" -> "Data Center/Crypto")
 *  starts a separate series, so a line never joins figures of different scope. */
export function datedSeries(rows: LoadReport[]): { key: string; label: string; scope: LoadScope; points: { t: number; mw: number }[] }[] {
  const dated = rows.filter((x) => !isForecast(x));
  if (new Set(dated.map((r) => r.ts)).size < 2) return [];
  const groups = new Map<string, LoadReport[]>();
  for (const r of dated) {
    const k = `${r.metric}|${r.stage ?? ""}|${r.scope}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const scopes = new Set(dated.map((r) => r.scope));
  return [...groups.entries()].map(([key, rs]) => ({
    key,
    label: `${METRIC_LABEL[rs[0].metric] ?? rs[0].metric}${rs[0].stage && rs[0].metric !== "requested" ? ` (${rs[0].stage})` : ""}${
      scopes.size > 1 ? ` · ${SCOPE_LABEL[rs[0].scope].toLowerCase()}` : ""
    }`,
    scope: rs[0].scope,
    points: rs.map((r) => ({ t: Date.parse(r.ts), mw: r.value_mw })).sort((a, b) => a.t - b.t),
  }));
}
