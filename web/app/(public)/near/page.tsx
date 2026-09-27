import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import NearForm from "@/components/public/NearForm";
import NearResults from "@/components/public/NearResults";
import { SiteFooter, SiteHeader } from "@/components/public/SiteChrome";
import { Container, ContextNote, EmptyState, ErrorState, SampleBanner } from "@/components/public/ui";
import { geocode } from "@/lib/geocode";
import { DEFAULT_RADIUS_MI, fmtDistance, RADIUS_MI } from "@/lib/geo";
import { getNearby } from "@/lib/publicQueries";
import { todayUtc } from "@/lib/queries";
import { siteHref } from "@/lib/slug";
import type { GeocodeFailure, GeocodeResult, NearbyResult } from "@/lib/types";

export const metadata: Metadata = { title: "Sites near you · Uncloak" };

const METHOD: Record<GeocodeResult["method"], string> = {
  coordinates: "your browser's location (rounded to about 100 m)",
  dataset: "the center of the sites recorded in that place, because the address lookup was unavailable",
  census: "the U.S. Census Bureau address geocoder",
  osm: "OpenStreetMap place search",
};

type Loaded =
  | { kind: "idle" }
  | { kind: "error" }
  | { kind: "unlocated"; where: GeocodeFailure }
  | { kind: "ok"; where: GeocodeResult; data: NearbyResult };

async function load(q: string, lat: number | null, lon: number | null, radius: number, county: string | null, label: string | null): Promise<Loaded> {
  if (!q && (lat == null || lon == null)) return { kind: "idle" };
  try {
    const where = await geocode(lat != null && lon != null ? `${lat},${lon}` : q);
    if (!where.ok) return { kind: "unlocated", where };
    const named = label ? { ...where, label } : where;
    const data = await getNearby({ lat: named.lat, lon: named.lon, label: named.label }, radius, todayUtc(), county ?? where.county);
    return { kind: "ok", where: named, data };
  } catch (err) {
    console.error("[gridsight near]", err);
    return { kind: "error" };
  }
}

export default async function NearPage(props: PageProps<"/near">) {
  await connection();
  const sp = await props.searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || null;
  };
  const q = one("q") ?? "";
  const num = (k: string) => {
    const v = one(k);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const lat = num("lat");
  const lon = num("lon");
  const r = num("radius");
  const radius = r != null && (RADIUS_MI as readonly number[]).includes(r) ? r : DEFAULT_RADIUS_MI;
  const res = await load(q, lat, lon, radius, one("county"), one("label"));

  return (
    <>
      <SiteHeader />
      {res.kind === "ok" && <SampleBanner show={res.data.sites.some((s) => s.is_sample)} />}
      <main id="main">
        <Container className="py-12">
          <p className="ub-eyebrow">Near me</p>
          <h1 className="rw-display-sm mt-3">
            {res.kind === "ok" ? <>Data-center sites near {res.where.label.split(",").slice(0, 2).join(",")}</> : "Find data-center sites near a place"}
          </h1>
          <p className="rw-subtitle mt-5 max-w-3xl">
            Enter a U.S. city, county, ZIP code or address, or share your location. We list every site in our records within the distance you choose,
            closest first, and explain what each one is.
          </p>

          <div className="mt-10 max-w-4xl">
            <NearForm q={q} radius={radius} lat={lat} lon={lon} />
          </div>

          <div className="mt-14">
            {res.kind === "idle" && (
              <EmptyState title="Start with a place">
                Try{" "}
                <Link href="/near?q=Abilene%2C%20TX" className="rw-link">
                  Abilene
                </Link>
                ,{" "}
                <Link href="/near?q=Loudoun%20County%2C%20VA&county=Loudoun" className="rw-link">
                  Loudoun County, VA
                </Link>{" "}
                or{" "}
                <Link href="/near?q=78725" className="rw-link">
                  78725
                </Link>
                .
              </EmptyState>
            )}
            {res.kind === "error" && <ErrorState />}
            {res.kind === "unlocated" && (
              <EmptyState title={res.where.reason === "outside_us" ? "Outside our coverage area" : "We couldn't find that place"}>{res.where.message}</EmptyState>
            )}
            {res.kind === "ok" && <Found res={res} radius={radius} />}
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}

function Found({ res, radius }: { res: Extract<Loaded, { kind: "ok" }>; radius: number }) {
  const { data, where } = res;
  const n = data.sites.length;
  const orgs = new Set(data.sites.map((s) => s.parent).filter(Boolean));
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--hairline)] pb-6">
        <div>
          <div className="text-[41px] font-normal leading-none tracking-[-1px]">
            {n} site{n === 1 ? "" : "s"}
          </div>
          <p className="mt-3 text-[15px] text-[var(--hairline-mid)]">
            within {radius} miles{orgs.size > 0 && `, linked to ${orgs.size} organization${orgs.size === 1 ? "" : "s"}`}.
          </p>
        </div>
        <p className="rw-meta max-w-md">
          Search point: {where.label}. Located with {METHOD[where.method]}. Distances are straight-line. Only the {data.total_located} sites with a
          published, reviewed or mapped location can be placed.
        </p>
      </div>

      {n > 0 ? (
        <NearResults data={data} />
      ) : (
        <EmptyState title={`No recorded sites within ${radius} miles`}>
          {data.nearest ? (
            <>
              The closest site in our records is{" "}
              <Link href={siteHref(data.nearest.project_id)} className="rw-link">
                {data.nearest.name}
              </Link>
              , {fmtDistance(data.nearest.distance_km)} {data.nearest.direction}. No site in the records doesn&apos;t mean no data center: some projects
              aren&apos;t in these filings, or have no published location.
            </>
          ) : (
            "No located sites in our records."
          )}
        </EmptyState>
      )}

      {data.unlocated.length > 0 && (
        <section aria-labelledby="unloc-h" className="mt-14">
          <h2 id="unloc-h" className="rw-heading-sm">
            Also in this county, exact location unavailable
          </h2>
          <p className="rw-meta mt-2">These sites are recorded in the county but have no published address, so we can&apos;t say how far away they are.</p>
          <ul className="mt-4 divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
            {data.unlocated.map((s) => (
              <li key={s.project_id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <Link href={siteHref(s.project_id)} className="text-[16px] text-black hover:underline hover:underline-offset-4">
                  {s.name}
                </Link>
                <span className="rw-meta">{s.parent ?? "Organization not linked"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-14 max-w-3xl">
        <ContextNote>
          <p>
            Every result is a <strong className="font-semibold text-black">facility</strong> from public records. Company headquarters aren&apos;t in
            this dataset. Being near a site doesn&apos;t mean it affects you, and these records don&apos;t measure local effects on bills, water, noise
            or reliability. What they show is who is building, where, and what has been filed.
          </p>
        </ContextNote>
      </div>
    </>
  );
}
