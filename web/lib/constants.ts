// Display/behaviour constants shared by the API and the UI. No data values live here.

export type Tier = "verified" | "likely" | "low";

/** Evidence-score thresholds for tiers (spec section 8). */
export const TIER_THRESHOLDS = { verified: 0.7, likely: 0.4 } as const;

export const TIER_COLORS: Record<Tier, string> = {
  verified: "#2E7D32",
  likely: "#F9A825",
  low: "#C62828",
};

/**
 * Map-only tier palette. Lifted, higher-luminance variants of the same hues,
 * tuned to stay legible against the basemap.
 */
export const TIER_COLORS_MAP: Record<Tier, string> = {
  verified: "#34D399",
  likely: "#FBBF24",
  low: "#FB7185",
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
  /** True-scale mode: the ERCOT-queue ring's radius as a share of the map's
   *  shorter side, and the smallest marker radius that stays clickable. */
  queueRingFraction: 0.42,
  scaleMarkerMinRadiusPx: 3.5,
  /** Soft outer glow drawn behind each marker, as a multiple of core radius. */
  markerHaloScale: 2.4,
  txCenter: [31.0, -99.3] as [number, number],
  txZoom: 6,
  /** Texas bounding box, fitted on mount so framing adapts to the panel size
   *  instead of depending on a fixed zoom that only looks right at one width. */
  txBounds: [
    [25.84, -106.65],
    [36.5, -93.51],
  ] as [[number, number], [number, number]],
  fitPaddingPx: 40,
  fitMaxZoom: 10,
  parentChipsCollapsed: 8,
};
