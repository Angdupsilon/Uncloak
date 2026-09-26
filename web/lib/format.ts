// Formatting helpers for the UI. Numbers are formatted here, never invented.
import type { EvidenceEvent } from "./types";

const DASH = "—";

export function fmtGW(v: number | null | undefined, digits = 1): string {
  return v == null ? DASH : `${v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })} GW`;
}

export function fmtMW(v: number | null | undefined): string {
  return v == null ? DASH : `${Math.round(v).toLocaleString()} MW`;
}

export function fmtUSD(v: number | null | undefined): string {
  if (v == null) return DASH;
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
  return `$${Math.round(v).toLocaleString()}`;
}

export function fmtPct(p: number | null | undefined): string {
  return p == null ? DASH : `${Math.round(p * 100)}%`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtMonth(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: "2-digit", month: "short", timeZone: "UTC" });
}

export const isLink = (url: string | null | undefined): url is string => !!url && /^https?:\/\//i.test(url);

const EVENT_NOUN: Record<string, [string, string]> = {
  building_registered: ["building registration", "building registrations"],
  square_footage: ["square-footage record", "square-footage records"],
  tenant_named: ["tenant named", "tenants named"],
  inspection_done: ["inspection done", "inspections done"],
  certified: ["Comptroller certification", "Comptroller certifications"],
  permit_filed: ["TCEQ permit filed", "TCEQ permits filed"],
  status_change: ["status change", "status changes"],
  site_mapped: ["atlas mapping", "atlas mappings"],
};

/** One-line description of a single event, e.g. "Tenant named: OpenAI". */
export function describeEvent(e: EvidenceEvent): string {
  const p = e.payload ?? {};
  switch (e.event_type) {
    case "tenant_named":
      return `Tenant named${p.tenant ? `: ${String(p.tenant)}` : ""}`;
    case "building_registered":
      return `Building registered${e.value_num != null ? ` (${fmtUSD(e.value_num)})` : ""}`;
    case "square_footage":
      return `Square footage${e.value_num != null ? `: ${Math.round(e.value_num).toLocaleString()} sq ft` : ""}`;
    case "permit_filed":
      return `TCEQ permit filed${p.permit_id ? ` (${String(p.permit_id)})` : ""}`;
    case "certified":
      return "Comptroller certified";
    case "inspection_done":
      return "Inspection done";
    case "status_change":
      return `Status${p.status ? `: ${String(p.status)}` : " changed"}`;
    case "site_mapped":
      return `Mapped in the IM3 data-center atlas (OpenStreetMap)${
        e.value_num != null ? ` · ${Math.round(e.value_num).toLocaleString()} sq ft footprint` : ""
      }`;
    default:
      return e.event_type;
  }
}

/** Group events for the Time Machine tooltip: "+ 4 building registrations", "+ tenant named: OpenAI". */
export function summarizeEvents(events: EvidenceEvent[]): string[] {
  const lines: string[] = [];
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.event_type === "tenant_named" || e.event_type === "status_change") {
      lines.push(`+ ${describeEvent(e).replace(/^\w/, (c) => c.toLowerCase())}`);
    } else {
      counts.set(e.event_type, (counts.get(e.event_type) ?? 0) + 1);
    }
  }
  for (const [type, n] of counts) {
    const [one, many] = EVENT_NOUN[type] ?? [type, type];
    lines.unshift(`+ ${n === 1 ? one : `${n} ${many}`}`);
  }
  return lines;
}
