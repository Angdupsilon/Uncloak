// Display/behaviour constants shared by the API and the UI. No data values live here.

export type Tier = "verified" | "likely" | "low";

/** Evidence-score thresholds for tiers (spec section 8). */
export const TIER_THRESHOLDS = { verified: 0.7, likely: 0.4 } as const;

export const TIER_COLORS: Record<Tier, string> = {
  verified: "#2E7D32",
  likely: "#F9A825",
  low: "#C62828",
};

export const TIER_LABELS: Record<Tier, string> = {
  verified: "Verified",
  likely: "Likely",
  low: "Low evidence",
};

export const TIER_ORDER: Tier[] = ["verified", "likely", "low"];

export function tierFor(probability: number | null | undefined): Tier {
  const p = probability ?? 0;
  if (p >= TIER_THRESHOLDS.verified) return "verified";
  if (p >= TIER_THRESHOLDS.likely) return "likely";
  return "low";
}

export const UNRESOLVED_PARENT = "Unresolved";

/** UI behaviour. */
export const UI = {
  playStepMs: 300,
  dimmedOpacity: 0.15,
  markerMinRadiusPx: 5,
  markerRadiusPerSqrtMw: 1.1,
  markerMaxRadiusPx: 40,
  txCenter: [31.0, -99.3] as [number, number],
  txZoom: 6,
  fitPaddingPx: 40,
  fitMaxZoom: 10,
};
