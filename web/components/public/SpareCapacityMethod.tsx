// Methodology section for the spare-capacity page. Thresholds are read from lib/spare.ts,
// so the explanation always matches the screens the page applies.
import Link from "next/link";
import { REGION_RULES, SCREEN } from "@/lib/spare";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function SpareCapacityMethod() {
  return (
    <>
      <p>
        <Link href="/spare-capacity" className="rw-link">
          Spare capacity
        </Link>{" "}
        compares each existing plant&apos;s grid connection with its hourly output. The connection size is the summed nameplate capacity of the
        plant&apos;s operating fossil generators in the EIA-860M monthly generator inventory. Hourly output is the gross load EPA CAMPD reports for those
        units, weighted by the share of each hour they ran. CAMPD doesn&apos;t cover solar and wind, so those plants aren&apos;t listed yet; batteries or
        renewables already sharing a fossil plant&apos;s connection are left out of both the connection size and the output.
      </p>
      <p>
        For every hour of the latest 365 days, the free room is the connection size minus that hour&apos;s output. &ldquo;Free in 80% of hours&rdquo; is the
        largest amount that was free in at least 80% of those hours; &ldquo;free in 95% of hours&rdquo; is the same at 95%. Uncloak stores a compact
        percentile summary for each plant-day in Tiger Data and combines 365 of them, so the figures are close approximations (within about 1%) rather
        than exact sorts of every hour.
      </p>
      <p>A plant passes a screen when:</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>
          <span className="text-black">Battery:</span> at least {SCREEN.batteryMinMw} MW is free in {pct(SCREEN.batteryCoverage)} of hours. The suggested size
          is that figure rounded down to 10 MW, for a {SCREEN.batteryHours}-hour battery that waits out the hours when the plant runs.
        </li>
        <li>
          <span className="text-black">Steady load, such as a data center:</span> at least {SCREEN.dataCenterMinMw} MW is free in {pct(SCREEN.steadyCoverage)} of
          hours. The load must curtail or run on on-site storage in the rest. Missing fiber within 2 miles is flagged, not excluded.
        </li>
        <li>
          <span className="text-black">Solar plus storage:</span> at least {SCREEN.solarStorageMinAcres} acres of adjacent open land and {SCREEN.solarStorageMinMw}{" "}
          MW free in {pct(SCREEN.batteryCoverage)} of hours. Existing solar farms are excluded, since more panels would compete for the same daylight hours.
        </li>
      </ul>
      <p>
        These are screens, not feasibility studies. Past output doesn&apos;t guarantee future room, the plant owner must agree to share, and total output must
        stay within the connection. {REGION_RULES.ERCOT?.body}
      </p>
    </>
  );
}
