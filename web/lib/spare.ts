// Spare-capacity finder: technology display and the screening rules that turn a
// plant's output statistics into candidate uses. The thresholds are screening
// assumptions shown in the UI, not engineering or interconnection studies.
import type { Plant, PlantTechnology } from "./types";

export const TECH_LABELS: Record<PlantTechnology, string> = {
  peaker: "Gas peaker",
  gas_cc: "Gas combined cycle",
  steam: "Steam (coal/gas)",
  solar: "Solar",
  wind: "Wind",
};

export const TECH_ORDER: PlantTechnology[] = ["peaker", "steam", "gas_cc", "solar", "wind"];

/** Map-visible hues, one per technology. */
export const TECH_COLORS: Record<PlantTechnology, string> = {
  peaker: "#F97316",
  gas_cc: "#8B5CF6",
  steam: "#475569",
  solar: "#EAB308",
  wind: "#0EA5E9",
};

export const SCREEN = {
  /** A battery needs the spare room most of the time; it can wait out the rest. */
  batteryCoverage: 0.8,
  batteryMinMw: 20,
  batteryHours: 4,
  /** A data center needs power nearly every hour, so it screens on the 95% figure. */
  steadyCoverage: 0.95,
  dataCenterMinMw: 50,
  /** Solar + storage behind the shared connection needs room for panels. */
  solarStorageMinAcres: 100,
  solarStorageMinMw: 20,
};

export type UseKey = "battery" | "data_center" | "solar_storage";

export const USE_LABELS: Record<UseKey, string> = {
  battery: "Battery",
  data_center: "Data center",
  solar_storage: "Solar + storage",
};

export interface UseFit {
  use: UseKey;
  mw: number;
  title: string;
  reason: string;
  caveat?: string;
}

const floorTo = (v: number, step: number) => Math.floor(v / step) * step;

/** Suggested battery size: the spare MW free in 80% of hours, rounded down to 10 MW. */
export function batteryMw(p: Plant): number {
  return p.spare_p80_mw == null ? 0 : floorTo(p.spare_p80_mw, 10);
}

/** Candidate uses for a plant, best first. Empty when the plant has no output data. */
export function fitsFor(p: Plant): UseFit[] {
  if (p.hours == null || p.spare_p80_mw == null || p.spare_p95_mw == null) return [];
  const fits: UseFit[] = [];

  const battery = batteryMw(p);
  if (battery >= SCREEN.batteryMinMw) {
    fits.push({
      use: "battery",
      mw: battery,
      title: `${battery} MW / ${SCREEN.batteryHours}-hr battery`,
      reason:
        p.technology === "solar"
          ? "Charges from the farm by day, discharges through the same connection at night."
          : `At least ${battery} MW of the connection is free in 80% of hours; the battery idles when the plant runs.`,
    });
  }

  const steady = floorTo(p.spare_p95_mw, 10);
  if (steady >= SCREEN.dataCenterMinMw) {
    fits.push({
      use: "data_center",
      mw: steady,
      title: `${steady} MW steady load (e.g. data center)`,
      reason: `${steady} MW is free in 95% of hours. The load must curtail or run on on-site storage in the rest.`,
      caveat: p.fiber_within_2mi ? undefined : "No fiber recorded within 2 miles.",
    });
  }

  if (p.technology !== "solar" && (p.open_acres ?? 0) >= SCREEN.solarStorageMinAcres && battery >= SCREEN.solarStorageMinMw) {
    fits.push({
      use: "solar_storage",
      mw: battery,
      title: `${battery} MW solar + storage`,
      reason: `About ${Math.round(p.open_acres!)} acres of adjacent open land; panels and batteries share the connection and serve a co-located load.`,
    });
  }
  return fits;
}

/** Share of days on which a battery of `mw` fits under the connection in every hour. */
export function unconstrainedDayShare(dailyMaxMw: number[], connectionMw: number, mw: number): number | null {
  if (!dailyMaxMw.length) return null;
  return dailyMaxMw.filter((m) => m + mw <= connectionMw).length / dailyMaxMw.length;
}

/** Region rules layer. Each grid operator treats shared connections differently. */
export const REGION_RULES: Record<string, { title: string; body: string }> = {
  ERCOT: {
    title: "ERCOT is outside FERC's surplus interconnection rule",
    body:
      "FERC's surplus interconnection service (Order 845) applies to FERC-jurisdictional grid operators. Most of ERCOT is not one, so adding a battery or solar at an existing Texas plant goes through ERCOT's own interconnection process, and pairing a large load with existing generation needs PUCT and ERCOT review under Texas SB 6 (2025). Verify the current rules for each deal.",
  },
};
