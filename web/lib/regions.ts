// Grid-operator tag: which balancing authority EIA-861 lists for the county a site is in. A lookup,
// not a measurement. When a county has several, the site is served by one of them and EIA-861
// doesn't say which, so we never pick one.
import type { RegionTag } from "./types";

export const EIA861_URL = "https://www.eia.gov/electricity/data/eia861/";

export interface RegionSummary {
  /** Short display value, e.g. "PJM" or "One of 3: BPAT, PACW, PGE". */
  value: string;
  /** Full sentence for a tooltip / caption. */
  detail: string;
  status: "tagged" | "several" | "not_published" | "unavailable";
}

const yearOf = (method: string) => method.match(/^eia861_(\d{4})_/)?.[1] ?? "";

export function regionLabel(r: RegionTag): string {
  return r.region_key.startsWith("EIA-BA-") ? r.name : r.region_key;
}

export function describeRegions(regions: RegionTag[], state: string, countyFips: string | null): RegionSummary {
  if (regions.length === 0) {
    if (state === "PR" && countyFips)
      return {
        value: "Not published here",
        detail: "EIA-861 publishes no balancing-authority service territory for Puerto Rico.",
        status: "not_published",
      };
    return {
      value: "Unavailable",
      detail: countyFips
        ? "EIA-861 lists no balancing authority for this county."
        : "The site has no county we could confirm, so its grid operator can't be looked up.",
      status: "unavailable",
    };
  }
  const year = yearOf(regions[0].method);
  const byName = regions[0].method.endsWith("_county_name")
    ? " Matched by county name: EIA-861 uses one name for this county and the independent city that shares it."
    : "";
  if (regions.length === 1) {
    const r = regions[0];
    return {
      value: regionLabel(r),
      detail: `${r.name}${r.region_key.startsWith("EIA-BA-") ? "" : ` (${r.region_key})`} is the only balancing authority EIA-861 (${year}) lists for this county.${byName}`,
      status: "tagged",
    };
  }
  const labels = regions.map(regionLabel);
  return {
    value: `One of ${regions.length}: ${labels.join(", ")}`,
    detail:
      `EIA-861 (${year}) lists ${regions.length} balancing authorities for this county: ${regions.map((r) => r.name).join("; ")}. ` +
      `Which one serves this site isn't published.${byName}`,
    status: "several",
  };
}
