// All SQL lives here. Every query is parameterized; the REST endpoints and the
// Gemini tool dispatcher both call these functions.
import { query } from "./db";
import { TIER_THRESHOLDS, UNRESOLVED_PARENT, tierFor } from "./constants";
import type {
  ErcotPoint,
  EvidenceEvent,
  ParentRow,
  Project,
  ProjectInfo,
  ScorePoint,
  ScoringConfig,
  Summary,
  Timeline,
  WeeklyPoint,
} from "./types";

// ---------------------------------------------------------------------------
// as_of handling
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Validate an ISO date (YYYY-MM-DD); default = today (UTC). Throws on garbage. */
export function parseAsOf(raw: string | null | undefined): string {
  if (!raw) return todayUtc();
  const s = raw.trim().slice(0, 10);
  if (!ISO_DATE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new BadRequest(`as_of must be an ISO date (YYYY-MM-DD), got "${raw}"`);
  }
  return s;
}

export class BadRequest extends Error {}

// A score row stamped at day D covers evidence dated on or before D.
// $1 is always the as_of date in these fragments.
const DAY_START = `(($1::date)::timestamp AT TIME ZONE 'UTC')`;
const DAY_END = `((($1::date) + 1)::timestamp AT TIME ZONE 'UTC')`;

// ---------------------------------------------------------------------------
// Metro bounding boxes for the Gemini filter_projects tool (approximate, editable).
// [minLat, minLon, maxLat, maxLon]
// ---------------------------------------------------------------------------

export const METROS = {
  Dallas: [32.4, -97.6, 33.45, -96.35],
  Houston: [29.3, -95.95, 30.3, -94.9],
  Austin: [29.95, -98.15, 30.75, -97.35],
  "San Antonio": [29.15, -98.85, 29.8, -98.2],
  Abilene: [32.0, -100.2, 32.9, -99.2],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type Metro = keyof typeof METROS;

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectFilters {
  parent?: string | null;
  county?: string | null;
  metro?: Metro | null;
  min_prob?: number | null;
  max_prob?: number | null;
  min_cost?: number | null;
  has_permit?: boolean | null;
  ids?: number[] | null;
}

// Latest score per project as of $1, plus cost/permit evidence consistent with that score.
// Materializing the latest scores lets the evidence table join to all projects in one
// pass. A per-project lateral aggregate makes Timescale scan every evidence chunk once
// per project, which becomes especially expensive while the date slider is playing.
const PROJECTS_AS_OF = `
  WITH latest_scores AS MATERIALIZED (
    SELECT p.project_id, s.ts, s.score, s.probability, s.mw_est, s.factors
    FROM projects p
    JOIN LATERAL (
      SELECT ps.ts, ps.score, ps.probability, ps.mw_est, ps.factors
      FROM project_scores ps
      WHERE ps.project_id = p.project_id AND ps.ts <= ${DAY_START}
      ORDER BY ps.ts DESC LIMIT 1
    ) s ON true
  ),
  evidence_by_project AS (
    SELECT s.project_id,
           SUM(x.value_num) FILTER (WHERE x.event_type = 'building_registered') AS total_cost,
           bool_or(x.event_type = 'permit_filed') AS has_permit
    FROM latest_scores s
    LEFT JOIN evidence_events x
      ON x.project_id = s.project_id AND x.ts < s.ts + interval '1 day'
    GROUP BY s.project_id
  )
  SELECT p.project_id, p.name, p.county, p.city, p.lat, p.lon, p.is_sample,
         e.llc_name, e.resolved_by, e.source_url AS entity_source_url,
         pa.name AS parent, pa.color_hex AS parent_color,
         s.ts AS scored_at, s.score, s.probability, s.mw_est, s.factors,
         ev.total_cost, COALESCE(ev.has_permit, false) AS has_permit
  FROM projects p
  LEFT JOIN entities e ON e.entity_id = p.entity_id
  LEFT JOIN parents pa ON pa.parent_id = e.parent_id
  JOIN latest_scores s ON s.project_id = p.project_id
  LEFT JOIN evidence_by_project ev ON ev.project_id = p.project_id`;

type ProjectRow = Omit<Project, "tier" | "scored_at"> & { scored_at: Date };

function toProject(r: ProjectRow): Project {
  return {
    ...r,
    scored_at: r.scored_at.toISOString(),
    probability: Number(r.probability),
    tier: tierFor(r.probability),
  };
}

export async function getProjects(asOf: string, f: ProjectFilters = {}): Promise<Project[]> {
  const params: unknown[] = [asOf];
  const where: string[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  if (f.parent) {
    if (f.parent.toLowerCase() === UNRESOLVED_PARENT.toLowerCase()) where.push("q.parent IS NULL");
    else where.push(`q.parent ILIKE '%' || ${add(f.parent)} || '%'`);
  }
  if (f.county) where.push(`q.county ILIKE ${add(f.county.replace(/\s+county$/i, "").trim())}`);
  if (f.metro) {
    const box = METROS[f.metro];
    if (!box) throw new BadRequest(`unknown metro "${f.metro}"`);
    where.push(`q.lat BETWEEN ${add(box[0])} AND ${add(box[2])} AND q.lon BETWEEN ${add(box[1])} AND ${add(box[3])}`);
  }
  if (f.min_prob != null) where.push(`q.probability >= ${add(f.min_prob)}`);
  if (f.max_prob != null) where.push(`q.probability <= ${add(f.max_prob)}`);
  if (f.min_cost != null) where.push(`q.total_cost >= ${add(f.min_cost)}`);
  if (f.has_permit != null) where.push(`q.has_permit = ${add(f.has_permit)}`);
  if (f.ids && f.ids.length) where.push(`q.project_id = ANY(${add(f.ids)}::int[])`);

  const sql = `SELECT * FROM (${PROJECTS_AS_OF}) q
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY q.probability DESC, q.name`;
  const rows = await query<ProjectRow>(sql, params);
  return rows.map(toProject);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export async function getSummary(asOf: string): Promise<Summary> {
  const [ercotRows, totals, weeklyRows] = await Promise.all([
    // ERCOT publishes these figures in different documents, so each one comes from its
    // own latest row on or before as_of and carries that row's date and source.
    query<{
      ts: Date; gw_requested: number; source_url: string | null;
      approved_ts: Date | null; gw_approved: number | null; approved_source_url: string | null;
      peak_ts: Date | null; gw_observed_peak: number | null; peak_source_url: string | null;
    }>(
      `SELECT r.ts, r.gw_requested, r.source_url,
              a.ts AS approved_ts, a.gw_approved, a.source_url AS approved_source_url,
              o.ts AS peak_ts, o.gw_observed_peak, o.source_url AS peak_source_url
       FROM (SELECT ts, gw_requested, source_url FROM ercot_queue
             WHERE ts < ${DAY_END} AND gw_requested IS NOT NULL ORDER BY ts DESC LIMIT 1) r
       LEFT JOIN LATERAL (SELECT ts, gw_approved, source_url FROM ercot_queue
             WHERE ts < ${DAY_END} AND gw_approved IS NOT NULL ORDER BY ts DESC LIMIT 1) a ON true
       LEFT JOIN LATERAL (SELECT ts, gw_observed_peak, source_url FROM ercot_queue
             WHERE ts < ${DAY_END} AND gw_observed_peak IS NOT NULL ORDER BY ts DESC LIMIT 1) o ON true`,
      [asOf],
    ),
    query<{ found_mw: number | null; realistic_mw: number | null; projects: number; projects_with_mw: number }>(
      `SELECT SUM(q.mw_est) AS found_mw, SUM(q.probability * q.mw_est) AS realistic_mw,
              COUNT(*) AS projects, COUNT(q.mw_est) AS projects_with_mw
       FROM (${PROJECTS_AS_OF}) q`,
      [asOf],
    ),
    // Continuous aggregate (time_bucket + last()) rolled up by the weekly_realistic_demand view.
    query<Omit<WeeklyPoint, "week"> & { week: Date }>(
      `SELECT week, realistic_gw, found_gw, projects
       FROM weekly_realistic_demand WHERE week <= ${DAY_START} ORDER BY week`,
      [asOf],
    ),
  ]);

  const t = totals[0];
  const hasMw = (t?.projects_with_mw ?? 0) > 0;
  const found_gw = hasMw ? Number(t.found_mw) / 1000 : null;
  const realistic_gw = hasMw ? Number(t.realistic_mw) / 1000 : null;
  const e = ercotRows[0];
  const ercot: ErcotPoint | null = e
    ? {
        ...e,
        ts: e.ts.toISOString(),
        approved_ts: e.approved_ts?.toISOString() ?? null,
        peak_ts: e.peak_ts?.toISOString() ?? null,
      }
    : null;
  const shadow_gw = ercot?.gw_requested != null && found_gw != null ? ercot.gw_requested - found_gw : null;
  const phantom_gw = ercot?.gw_requested != null && ercot.gw_approved != null ? ercot.gw_requested - ercot.gw_approved : null;

  return {
    as_of: asOf,
    ercot,
    found_gw,
    realistic_gw,
    shadow_gw,
    phantom_gw,
    projects: t?.projects ?? 0,
    projects_with_mw: t?.projects_with_mw ?? 0,
    weekly: weeklyRows.map((w) => ({
      week: w.week.toISOString(),
      realistic_gw: hasMw ? w.realistic_gw : null,
      found_gw: hasMw ? w.found_gw : null,
      projects: w.projects,
    })),
  };
}

// ---------------------------------------------------------------------------
// Parents
// ---------------------------------------------------------------------------

export async function getParents(asOf: string): Promise<ParentRow[]> {
  return query<ParentRow>(
    `SELECT COALESCE(q.parent, $2) AS name, q.parent_color AS color,
            SUM(q.mw_est) AS mw_total,
            SUM(q.probability * q.mw_est) AS mw_weighted,
            SUM(q.mw_est) FILTER (WHERE q.probability >= $3) AS mw_verified,
            COUNT(*) AS projects
     FROM (${PROJECTS_AS_OF}) q
     GROUP BY q.parent, q.parent_color
     ORDER BY SUM(q.probability * q.mw_est) DESC NULLS LAST, COUNT(*) DESC, 1`,
    [asOf, UNRESOLVED_PARENT, TIER_THRESHOLDS.verified],
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const PROJECT_INFO = `
  SELECT p.project_id, p.name, p.county, p.city, p.address, p.lat, p.lon, p.is_sample,
         e.llc_name, e.resolved_by, e.source_url AS entity_source_url,
         pa.name AS parent, pa.color_hex AS parent_color
  FROM projects p
  LEFT JOIN entities e ON e.entity_id = p.entity_id
  LEFT JOIN parents pa ON pa.parent_id = e.parent_id`;

export async function getTimeline(projectId: number, asOf: string): Promise<Timeline | null> {
  const [info, scored, scores, events] = await Promise.all([
    query<ProjectInfo>(`${PROJECT_INFO} WHERE p.project_id = $1`, [projectId]),
    getProjects(asOf, { ids: [projectId] }),
    query<Omit<ScorePoint, "ts"> & { ts: Date }>(
      `SELECT ts, score, probability, mw_est, factors FROM project_scores
       WHERE project_id = $2 AND ts <= ${DAY_START} ORDER BY ts`,
      [asOf, projectId],
    ),
    query<Omit<EvidenceEvent, "ts"> & { ts: Date }>(
      `SELECT ts, source, event_type, value_num, payload - '_origin' AS payload, source_url
       FROM evidence_events WHERE project_id = $2 AND ts < ${DAY_END} ORDER BY ts`,
      [asOf, projectId],
    ),
  ]);
  if (!info[0]) return null;
  return {
    as_of: asOf,
    project: { ...info[0], ...(scored[0] ?? {}) },
    scores: scores.map((s) => ({ ...s, ts: s.ts.toISOString() })),
    events: events.map((e) => ({ ...e, ts: e.ts.toISOString() })),
  };
}

// ---------------------------------------------------------------------------
// Fuzzy lookup for "Ask GridSight" (project name, LLC name, or parent name)
// ---------------------------------------------------------------------------

export interface LookupResult {
  projects: { project_id: number; name: string; llc_name: string | null; parent: string | null; matched_on: string }[];
  entities: { llc_name: string; parent: string | null; resolved_by: string | null; source_url: string | null; project_names: string[] }[];
}

export async function lookupProjectOrEntity(nameOrId: string): Promise<LookupResult> {
  const term = nameOrId.trim();
  if (/^\d+$/.test(term)) {
    const rows = await query<LookupResult["projects"][number]>(
      `SELECT p.project_id, p.name, e.llc_name, pa.name AS parent, 'id' AS matched_on
       FROM projects p LEFT JOIN entities e ON e.entity_id = p.entity_id
       LEFT JOIN parents pa ON pa.parent_id = e.parent_id WHERE p.project_id = $1`,
      [Number(term)],
    );
    if (rows.length) return { projects: rows, entities: [] };
  }
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const [projects, entities] = await Promise.all([
    query<LookupResult["projects"][number]>(
      `SELECT p.project_id, p.name, e.llc_name, pa.name AS parent,
              CASE WHEN p.name ILIKE $1 THEN 'project name'
                   WHEN e.llc_name ILIKE $1 THEN 'LLC name' ELSE 'parent name' END AS matched_on
       FROM projects p LEFT JOIN entities e ON e.entity_id = p.entity_id
       LEFT JOIN parents pa ON pa.parent_id = e.parent_id
       WHERE p.name ILIKE $1 OR e.llc_name ILIKE $1 OR pa.name ILIKE $1
       ORDER BY (p.name ILIKE $1) DESC, (e.llc_name ILIKE $1) DESC, length(p.name), p.name
       LIMIT 10`,
      [like],
    ),
    query<LookupResult["entities"][number]>(
      `SELECT e.llc_name, pa.name AS parent, e.resolved_by, e.source_url,
              COALESCE(array_agg(p.name ORDER BY p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS project_names
       FROM entities e LEFT JOIN parents pa ON pa.parent_id = e.parent_id
       LEFT JOIN projects p ON p.entity_id = e.entity_id
       WHERE e.llc_name ILIKE $1
       GROUP BY e.entity_id, e.llc_name, pa.name, e.resolved_by, e.source_url
       LIMIT 10`,
      [like],
    ),
  ]);
  return { projects, entities };
}

// ---------------------------------------------------------------------------
// Scoring config (written by etl/score.py)
// ---------------------------------------------------------------------------

export async function getConfig(asOf: string): Promise<ScoringConfig> {
  const [cfg, latest] = await Promise.all([
    query<{
      factors: ScoringConfig["factors"];
      mw_cost_per_mw_usd: number | null;
      mw_cost_source: string | null;
      backfill_start: Date | null;
      computed_at: Date | null;
    }>(`SELECT factors, mw_cost_per_mw_usd, mw_cost_source, backfill_start, computed_at FROM scoring_config WHERE id = 1`),
    query<{ ts: Date | null }>(`SELECT max(ts) AS ts FROM project_scores`),
  ]);
  const c = cfg[0];
  return {
    as_of: asOf,
    factors: c?.factors ?? [],
    mw_cost_per_mw_usd: c?.mw_cost_per_mw_usd ?? null,
    mw_cost_source: c?.mw_cost_source ?? null,
    // backfill_start is a SQL date; pg parses it at local midnight, so format with local getters.
    backfill_start: c?.backfill_start ? formatLocalDate(c.backfill_start) : null,
    computed_at: c?.computed_at ? c.computed_at.toISOString() : null,
    tier_thresholds: { ...TIER_THRESHOLDS },
    latest_score_date: latest[0]?.ts ? latest[0].ts.toISOString().slice(0, 10) : null,
  };
}

function formatLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
