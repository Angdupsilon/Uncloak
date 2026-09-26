import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import SpareCapacityExplorer from "@/components/public/SpareCapacityExplorer";
import { BigStat, Container, ContextNote, EmptyState, ErrorState, SampleBanner, SectionTitle, StatBand } from "@/components/public/ui";
import { fmtDate, fmtGW } from "@/lib/format";
import { getPlants } from "@/lib/queries";
import { REGION_RULES, fitsFor } from "@/lib/spare";
import type { Plant } from "@/lib/types";

export const metadata: Metadata = {
  title: "Spare capacity · Uncloak",
  description: "Texas power plants whose grid connection sits mostly idle, where a battery, solar farm or new load could share it.",
};

async function load() {
  try {
    return { ok: true as const, plants: await getPlants() };
  } catch (err) {
    console.error("[gridsight spare capacity]", err);
    return { ok: false as const };
  }
}

const sumGW = (plants: Plant[], pick: (p: Plant) => number | null) => {
  const vals = plants.map(pick).filter((v): v is number => v != null);
  return vals.length ? fmtGW(vals.reduce((a, b) => a + b, 0) / 1000) : null;
};

export default async function SpareCapacityPage() {
  await connection();
  const res = await load();
  const plants = res.ok ? res.plants : [];
  const withOutput = plants.filter((p) => p.hours != null);
  const windowEnd = withOutput.map((p) => p.window_end).find(Boolean) ?? null;
  const windowStart = withOutput.map((p) => p.window_start).find(Boolean) ?? null;
  const period = windowStart && windowEnd ? `${fmtDate(windowStart)} – ${fmtDate(windowEnd)}` : undefined;
  const coverage = `Across ${withOutput.length} of ${plants.length} plants with hourly output.`;

  return (
    <>
      <SiteHeader />
      <SampleBanner show={plants.some((p) => p.is_sample)} />
      <main id="main">
        <Container className="py-12">
          <p className="ub-eyebrow">Spare capacity</p>
          <h1 className="rw-display-sm mt-3">Where new power could share an existing connection</h1>
          <p className="rw-subtitle mt-5 max-w-3xl">
            Every power plant has a grid connection sized for its maximum output, but many rarely run flat out. A battery, solar farm or new load could
            share that idle room instead of waiting years in the queue for a connection of its own. This page shows how often each Texas plant&apos;s
            connection sits unused.
          </p>

          {!res.ok ? (
            <div className="mt-10">
              <ErrorState />
            </div>
          ) : plants.length === 0 ? (
            <div className="mt-10">
              <EmptyState title="No plants loaded yet">Plant and hourly output data haven&apos;t been loaded into the database.</EmptyState>
            </div>
          ) : (
            <>
              <section aria-labelledby="glance-h" className="mt-12">
                <SectionTitle id="glance-h" aside={period && `Hourly output, ${period}`}>
                  At a glance
                </SectionTitle>
                <StatBand>
                  <BigStat metric="spare_p80" label="Free in 80% of hours" value={sumGW(withOutput, (p) => p.spare_p80_mw)} note={coverage} period={period} />
                  <BigStat metric="spare_p95" label="Free in 95% of hours" value={sumGW(withOutput, (p) => p.spare_p95_mw)} note="The steadier room a round-the-clock load would need." period={period} />
                  <BigStat metric="plant_connection" label="Connections screened" value={fmtGW(plants.reduce((a, p) => a + p.connection_mw, 0) / 1000)} note={`${plants.length} plants in ERCOT.`} />
                  <BigStat
                    metric="spare_sites"
                    label="Sites that pass a screen"
                    value={withOutput.filter((p) => fitsFor(p).length > 0).length.toLocaleString()}
                    note="Fit a battery, a steady load, or solar plus storage."
                  />
                </StatBand>
              </section>

              <section aria-labelledby="explore-h" className="mt-16">
                <SectionTitle id="explore-h" aside={<Link href="/methodology#spare-capacity" className="rw-link">How the screens work</Link>}>
                  Find a site
                </SectionTitle>
                <SpareCapacityExplorer plants={plants} />
              </section>

              {REGION_RULES.ERCOT && (
                <section aria-labelledby="rules-h" className="mt-16 max-w-3xl">
                  <SectionTitle id="rules-h">Before anyone builds</SectionTitle>
                  <ContextNote>
                    <p>
                      <span className="text-black">{REGION_RULES.ERCOT.title}.</span> {REGION_RULES.ERCOT.body}
                    </p>
                    <p>
                      A plant&apos;s owner must agree to share its connection, and total output must stay within the connection limit. These figures find
                      candidates; they don&apos;t show that a project is feasible.
                    </p>
                  </ContextNote>
                </section>
              )}
            </>
          )}
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
