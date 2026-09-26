// Queries behind the public research pages (search, organization and site profiles, nearby).
// Same rules as queries.ts: parameterized SQL, read-only role, every number from the database.
// The full site list is small (a few hundred rows), so profile, comparison and nearby
// figures are all computed from ONE site query. That keeps every page consistent with every
// other page and makes double counting impossible: each site belongs to one entity, and each
// entity to at most one organization.
import { cache } from "react";
import { query } from "./db";
import { tierFor } from "./constants";
import { compass, haversineKm, KM_PER_MI } from "./geo";
import { slugify, orgHref, siteHref } from "./slug";
import { getTimeline } from "./queries";
import type { NearbyResult, OrgEntity, OrgProfile, OrgTrendPoint, SearchHit, Site, SourceStat, Timeline } from "./types";

const DAY_START = `(($1::date)::timestamp AT TIME ZONE 'UTC')`;
const DAY_END = `((($1::date) + 1)::timestamp AT TIME ZONE 'UTC')`;

// Every site (scored or not), with the latest score on or before $1 and evidence up to $1.
const SITES_AS_OF = `
  WITH latest AS MATERIALIZED (
    SELECT p.project_id, s.ts, s.score, s.probability, s.mw_est
    FROM projects p
    JOIN LATERAL (
      SELECT ps.ts, ps.score, ps.probability, ps.mw_est
      FROM project_scores ps
      WHERE ps.project_id = p.project_id AND ps.ts <= ${DAY_START}
      ORDER BY ps.ts DESC LIMIT 1
    ) s ON true
  ),
  ev AS (
    SELECT x.project_id,
           SUM(x.value_num) FILTER (WHERE x.event_type = 'building_registered') AS total_cost,
           COUNT(*) FILTER (WHERE x.event_type = 'building_registered') AS tdlr_registrations,
           SUM(x.value_num) FILTER (WHERE x.event_type = 'square_footage') AS sqft,
           MIN(x.ts) FILTER (WHERE x.event_type = 'certified') AS certified_at,
           (array_agg(x.payload->>'program' ORDER BY x.ts) FILTER (WHERE x.event_type = 'certified'))[1] AS program,
           COALESCE(array_agg(DISTINCT x.payload->>'tenant')
             FILTER (WHERE x.event_type = 'tenant_named' AND x.payload->>'tenant' IS NOT NULL), '{}') AS tenants,
           COALESCE(bool_or(x.event_type = 'permit_filed'), false) AS has_permit,
           COALESCE(bool_or(x.event_type = 'inspection_done'), false) AS inspected,
           MIN(x.ts) AS first_evidence,
           MAX(x.ts) AS last_evidence,
           array_agg(DISTINCT x.source) AS sources
    FROM evidence_events x
    WHERE x.ts < ${DAY_END}
    GROUP BY x.project_id
  )
  SELECT p.project_id, p.name, p.county, p.city, p.address, p.lat, p.lon, p.is_sample,
         e.llc_name, e.resolved_by, e.source_url AS entity_source_url,
         pa.name AS parent, pa.color_hex AS parent_color,
         l.ts AS scored_at, l.score, l.probability, l.mw_est,
         ev.total_cost, COALESCE(ev.tdlr_registrations, 0) AS tdlr_registrations, ev.sqft,
         ev.certified_at, ev.program, COALESCE(ev.tenants, '{}') AS tenants,
         COALESCE(ev.has_permit, false) AS has_permit, COALESCE(ev.inspected, false) AS inspected,
         ev.first_evidence, ev.last_evidence, COALESCE(ev.sources, '{}') AS sources
  FROM projects p
  LEFT JOIN entities e ON e.entity_id = p.entity_id
  LEFT JOIN parents pa ON pa.parent_id = e.parent_id
  LEFT JOIN latest l ON l.project_id = p.project_id
  LEFT JOIN ev ON ev.project_id = p.project_id
  ORDER BY p.name`;

type Dated = Date | null;
type SiteRow = Omit<Site, "scored_at" | "certified_at" | "first_evidence" | "last_evidence" | "tier"> & {
  scored_at: Dated;
  certified_at: Dated;
  first_evidence: Dated;
  last_evidence: Dated;
};

const iso = (d: Dated) => (d ? d.toISOString() : null);

function toSite(r: SiteRow): Site {
  const probability = r.probability == null ? null : Number(r.probability);
  return {
    ...r,
    probability,
    tier: probability == null ? null : tierFor(probability),
    scored_at: iso(r.scored_at),
    certified_at: iso(r.certified_at),
    first_evidence: iso(r.first_evidence),
    last_evidence: iso(r.last_evidence),
  };
}
/** All sites as of a date. Cached per request, so a page and its sections share one query. */
export const getSites = cache(async (asOf: string): Promise<Site[]> => {
  const rows = await query<SiteRow>(SITES_AS_OF, [asOf]);
  return rows.map(toSite);
});

/** Organization names (parents) with a site count; Unresolved is not an organization. */
export async function getOrgIndex(asOf: string) {
  const [parents, sites] = await Promise.all([
    query<{ name: string; color_hex: string | null }>(`SELECT name, color_hex FROM parents ORDER BY name`),
    getSites(asOf),
  ]);
  return parents
    .map((p) => {
      const own = sites.filter((s) => s.parent === p.name);
      const mw = own.filter((s) => s.mw_est != null);
      return {
        name: p.name,
        slug: slugify(p.name),
        color: p.color_hex,
        sites: own.length,
        mw_total: mw.length ? mw.reduce((a, s) => a + (s.mw_est ?? 0), 0) : null,
        is_sample: own.some((s) => s.is_sample),
      };
    })
    .sort((a, b) => b.sites - a.sites || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const likeEscape = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`);

export async function search(raw: string, perKind = 6): Promise<SearchHit[]> {
  const term = raw.trim().slice(0, 120);
  if (term.length < 2) return [];
  const like = `%${likeEscape(term)}%`;
  const prefix = `${likeEscape(term)}%`;
  const word = `% ${likeEscape(term)}%`;

  const [orgs, sites, entities, cities, counties] = await Promise.all([
    query<{ name: string; sites: number; is_sample: boolean }>(
      `SELECT pa.name, COUNT(p.project_id) AS sites, COALESCE(bool_or(p.is_sample), false) AS is_sample
       FROM parents pa
       LEFT JOIN entities e ON e.parent_id = pa.parent_id
       LEFT JOIN projects p ON p.entity_id = e.entity_id
       WHERE pa.name ILIKE $1
       GROUP BY pa.name
       ORDER BY (pa.name ILIKE $2) DESC, (pa.name ILIKE $3) DESC, COUNT(p.project_id) DESC, pa.name
       LIMIT $4`,
      [like, prefix, word, perKind],
    ),
    query<{ project_id: number; name: string; city: string | null; county: string | null; parent: string | null; is_sample: boolean }>(
      `SELECT p.project_id, p.name, p.city, p.county, pa.name AS parent, p.is_sample
       FROM projects p
       LEFT JOIN entities e ON e.entity_id = p.entity_id
       LEFT JOIN parents pa ON pa.parent_id = e.parent_id
       WHERE p.name ILIKE $1 OR p.address ILIKE $1
       ORDER BY (p.name ILIKE $2) DESC, (p.name ILIKE $3) DESC, (p.name ILIKE $1) DESC, length(p.name), p.name
       LIMIT $4`,
      [like, prefix, word, perKind],
    ),
    query<{ llc_name: string; parent: string | null; project_id: number | null; project_name: string | null; n: number; is_sample: boolean }>(
      `SELECT e.llc_name, pa.name AS parent, MIN(p.project_id) AS project_id, MIN(p.name) AS project_name,
              COUNT(p.project_id) AS n, COALESCE(bool_or(p.is_sample), false) AS is_sample
       FROM entities e
       LEFT JOIN parents pa ON pa.parent_id = e.parent_id
       LEFT JOIN projects p ON p.entity_id = e.entity_id
       WHERE e.llc_name ILIKE $1
       GROUP BY e.entity_id, e.llc_name, pa.name
       HAVING COUNT(p.project_id) > 0 OR pa.name IS NOT NULL
       ORDER BY (e.llc_name ILIKE $2) DESC, length(e.llc_name), e.llc_name
       LIMIT $3`,
      [like, prefix, perKind],
    ),
    query<{ city: string; county: string | null; n: number }>(
      `SELECT city, MIN(county) AS county, COUNT(*) AS n FROM projects
       WHERE city ILIKE $1 GROUP BY city ORDER BY (city ILIKE $2) DESC, COUNT(*) DESC LIMIT $3`,
      [like, prefix, perKind],
    ),
    query<{ county: string; n: number }>(
      `SELECT county, COUNT(*) AS n FROM projects
       WHERE county ILIKE $1 GROUP BY county ORDER BY (county ILIKE $2) DESC, COUNT(*) DESC LIMIT $3`,
      [like.replace(/\s+county%$/i, "%"), prefix.replace(/\s+county%$/i, "%"), perKind],
    ),
  ]);

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const where = (city: string | null, county: string | null) =>
    [city, county && `${county} County`].filter(Boolean).join(", ") || "Location not recorded";

  const hits: SearchHit[] = [
    ...orgs.map((o) => ({
      kind: "org" as const,
      label: o.name,
      sublabel: `Organization · ${plural(o.sites, "site")} in Texas records`,
      href: orgHref(o.name),
      is_sample: o.is_sample,
    })),
    ...cities.map((c) => ({
      kind: "city" as const,
      label: `${c.city}, TX`,
      sublabel: `City · ${plural(c.n, "site")} recorded${c.county ? ` · ${c.county} County` : ""}`,
      href: `/near?q=${encodeURIComponent(`${c.city}, TX`)}`,
    })),
    ...counties.map((c) => ({
      kind: "county" as const,
      label: `${c.county} County, TX`,
      sublabel: `County · ${plural(c.n, "site")} recorded`,
      href: `/near?q=${encodeURIComponent(`${c.county} County, TX`)}&county=${encodeURIComponent(c.county)}`,
    })),
    ...sites.map((s) => ({
      kind: "site" as const,
      label: s.name,
      sublabel: `Site · ${where(s.city, s.county)}${s.parent ? ` · ${s.parent}` : ""}`,
      href: siteHref(s.project_id),
      is_sample: s.is_sample,
    })),
    ...entities
      // An LLC whose name equals its site's name adds nothing over the site hit.
      .filter((e) => !(e.n === 1 && e.project_name && sites.some((s) => s.project_id === e.project_id)))
      .map((e) => ({
        kind: "entity" as const,
        label: e.llc_name,
        sublabel: `Registered entity · ${e.parent ? `linked to ${e.parent}` : "organization not resolved"}${e.n ? ` · ${plural(e.n, "site")}` : ""}`,
        href: e.parent ? orgHref(e.parent) : siteHref(e.project_id!),
        is_sample: e.is_sample,
      })),
  ];

  // Always offer a location search, so a ZIP, a street address or a city with no
  // recorded site still leads somewhere useful.
  const zip = /^\d{5}$/.test(term);
  hits.push({
    kind: zip ? "zip" : "place",
    label: zip ? `ZIP ${term}` : `Sites near “${term}”`,
    sublabel: zip ? "Find recorded sites near this ZIP code" : "Treat this as a place or address and look for nearby sites",
    href: `/near?q=${encodeURIComponent(term)}`,
  });
  return hits;
}

// ---------------------------------------------------------------------------
// Organization profile
// ---------------------------------------------------------------------------

export async function resolveOrgSlug(slug: string): Promise<{ name: string; color: string | null } | null> {
  const parents = await query<{ name: string; color_hex: string | null }>(`SELECT name, color_hex FROM parents`);
  const p = parents.find((x) => slugify(x.name) === slug);
  return p ? { name: p.name, color: p.color_hex } : null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function getOrgProfile(slug: string, asOf: string): Promise<OrgProfile | null> {
  const org = await resolveOrgSlug(slug);
  if (!org) return null;

  const [allSites, entityRows, trendRows, sourceRows, cfg] = await Promise.all([
    getSites(asOf),
    query<{ llc_name: string; resolved_by: string | null; source_url: string | null }>(
      `SELECT e.llc_name, e.resolved_by, e.source_url
       FROM entities e JOIN parents pa ON pa.parent_id = e.parent_id
       WHERE pa.name = $1 ORDER BY e.llc_name`,
      [org.name],
    ),
    // Continuous aggregate: one row per site per week once the site has any evidence.
    query<{ week: Date; sites: number; mw: number | null }>(
      `SELECT w.week, COUNT(*) AS sites, SUM(w.mw) AS mw
       FROM weekly_project_state w
       JOIN projects p ON p.project_id = w.project_id
       JOIN entities e ON e.entity_id = p.entity_id
       JOIN parents pa ON pa.parent_id = e.parent_id
       WHERE pa.name = $2 AND w.week <= ${DAY_START}
       GROUP BY w.week ORDER BY w.week`,
      [asOf, org.name],
    ),
    query<{ source: string; records: number; first: Dated; last: Dated; retrieved: string | null }>(
      `SELECT x.source, COUNT(*) AS records, MIN(x.ts) AS first, MAX(x.ts) AS last,
              MAX(x.payload->>'retrieved') AS retrieved
       FROM evidence_events x
       JOIN projects p ON p.project_id = x.project_id
       JOIN entities e ON e.entity_id = p.entity_id
       JOIN parents pa ON pa.parent_id = e.parent_id
       WHERE pa.name = $2 AND x.ts < ${DAY_END}
       GROUP BY x.source ORDER BY COUNT(*) DESC`,
      [asOf, org.name],
    ),
    query<{ computed_at: Date | null }>(`SELECT computed_at FROM scoring_config WHERE id = 1`),
  ]);

  const sites = allSites.filter((s) => s.parent === org.name);
  const entities: OrgEntity[] = entityRows.map((e) => ({
    ...e,
    sites: sites.filter((s) => s.llc_name === e.llc_name).map((s) => ({ project_id: s.project_id, name: s.name })),
  }));

  // Comparison with every other resolved organization, from the same site list.
  const byOrg = new Map<string, { sites: number; mw: number | null }>();
  for (const s of allSites) {
    if (!s.parent) continue;
    const cur = byOrg.get(s.parent) ?? { sites: 0, mw: null };
    cur.sites += 1;
    if (s.mw_est != null) cur.mw = (cur.mw ?? 0) + s.mw_est;
    byOrg.set(s.parent, cur);
  }
  const rows = [...byOrg.entries()];
  const mine = byOrg.get(org.name);
  const rankBy = (val: (r: { sites: number; mw: number | null }) => number | null) => {
    const v = mine ? val(mine) : null;
    if (v == null) return null;
    return 1 + rows.filter(([, r]) => (val(r) ?? -Infinity) > v).length;
  };
  const mwRows = rows.filter(([, r]) => r.mw != null);

  const trend: OrgTrendPoint[] = trendRows.map((t) => ({ week: t.week.toISOString(), sites: t.sites, mw: t.mw }));
  const sources: SourceStat[] = sourceRows.map((r) => ({ ...r, first: iso(r.first), last: iso(r.last) }));

  return {
    as_of: asOf,
    name: org.name,
    slug,
    color: org.color,
    sites,
    entities,
    trend,
    sources,
    comparison: {
      orgs_ranked: rows.length,
      rank_sites: rankBy((r) => r.sites),
      rank_mw: rankBy((r) => r.mw),
      total_sites: allSites.filter((s) => s.parent).length,
      total_mw: mwRows.length ? mwRows.reduce((a, [, r]) => a + (r.mw ?? 0), 0) : null,
      median_sites: median(rows.map(([, r]) => r.sites)),
    },
    computed_at: cfg[0]?.computed_at?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Site profile
// ---------------------------------------------------------------------------

export interface SiteProfile {
  site: Site;
  timeline: Timeline | null;
  siblings: Site[]; // other sites of the same organization
  nearby: (Site & { distance_km: number })[]; // closest other sites (any organization)
  certification: Record<string, unknown> | null; // payload of the earliest Comptroller record
}

export async function getSiteProfile(id: number, asOf: string): Promise<SiteProfile | null> {
  const [sites, timeline] = await Promise.all([getSites(asOf), getTimeline(id, asOf)]);
  const site = sites.find((s) => s.project_id === id);
  if (!site) return null;
  const siblings = site.parent ? sites.filter((s) => s.parent === site.parent && s.project_id !== id) : [];
  const nearby =
    site.lat != null && site.lon != null
      ? sites
          .filter((s) => s.project_id !== id && s.lat != null && s.lon != null)
          .map((s) => ({ ...s, distance_km: haversineKm(site.lat!, site.lon!, s.lat!, s.lon!) }))
          .sort((a, b) => a.distance_km - b.distance_km)
          .slice(0, 5)
      : [];
  const cert = timeline?.events.find((e) => e.event_type === "certified")?.payload ?? null;
  return { site, timeline, siblings, nearby, certification: cert };
}

// ---------------------------------------------------------------------------
// Nearby
// ---------------------------------------------------------------------------

export async function getNearby(
  center: { lat: number; lon: number; label: string },
  radiusMi: number,
  asOf: string,
  county: string | null,
): Promise<NearbyResult> {
  const sites = await getSites(asOf);
  const located = sites.filter((s) => s.lat != null && s.lon != null);
  const radiusKm = radiusMi * KM_PER_MI;
  const all = located
    .map((s) => ({
      ...s,
      distance_km: haversineKm(center.lat, center.lon, s.lat!, s.lon!),
      direction: compass(center.lat, center.lon, s.lat!, s.lon!),
    }))
    .sort((a, b) => a.distance_km - b.distance_km);
  const near = all.filter((s) => s.distance_km <= radiusKm);
  const c = county?.replace(/\s+county$/i, "").trim().toLowerCase();
  const unlocated = c ? sites.filter((s) => (s.lat == null || s.lon == null) && s.county?.toLowerCase() === c) : [];
  return { as_of: asOf, center, radius_mi: radiusMi, sites: near, unlocated, total_located: located.length, nearest: near.length ? null : (all[0] ?? null) };
}

/** Center of a county or city's located sites, for when the external geocoder is unavailable. */
export async function datasetPlace(term: string): Promise<{ label: string; lat: number; lon: number; county: string | null } | null> {
  const t = term.trim().replace(/,?\s*(tx|texas)$/i, "").trim();
  if (!t) return null;
  const isCounty = /\s+county$/i.test(t);
  const name = t.replace(/\s+county$/i, "").trim();
  const sites = (await getSites(new Date().toISOString().slice(0, 10))).filter((s) => s.lat != null && s.lon != null);
  const pick = (field: "county" | "city") => sites.filter((s) => s[field]?.toLowerCase() === name.toLowerCase());
  const byCounty = pick("county");
  const byCity = isCounty ? [] : pick("city");
  const list = byCity.length ? byCity : byCounty;
  if (!list.length) return null;
  const lat = list.reduce((a, s) => a + s.lat!, 0) / list.length;
  const lon = list.reduce((a, s) => a + s.lon!, 0) / list.length;
  const asCounty = !byCity.length;
  return {
    label: asCounty ? `${list[0].county} County, TX (center of recorded sites)` : `${list[0].city}, TX (center of recorded sites)`,
    lat,
    lon,
    county: asCounty ? list[0].county : null,
  };
}
