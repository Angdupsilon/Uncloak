import type { Tier } from "./constants";

export interface Project {
  project_id: number;
  name: string;
  county: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  site_id: number | null;
  site_name: string | null;
  location_source_url: string | null;
  location_method: string | null;
  location_precision: string | null;
  location_confidence: number | null;
  current_status: string | null;
  status_observed_at: string | null;
  sourced_mw: number | null;
  capacity_type: "actual" | "announced" | "interconnection" | "modeled" | null;
  capacity_source_url: string | null;
  llc_name: string | null;
  resolved_by: string | null;
  entity_source_url: string | null;
  parent: string | null;
  parent_color: string | null;
  scored_at: string;
  score: number;
  probability: number;
  mw_est: number | null;
  total_cost: number | null;
  has_permit: boolean;
  tier: Tier;
  factors: Record<string, boolean>;
  is_sample: boolean;
}

export interface ErcotPoint {
  ts: string; // date of gw_requested
  gw_requested: number | null;
  source_url: string | null;
  gw_approved: number | null; // "Approval to Energize"
  approved_ts: string | null;
  approved_source_url: string | null;
  gw_observed_peak: number | null; // "Observed Energized" (all-time non-simultaneous peak)
  peak_ts: string | null;
  peak_source_url: string | null;
}

export interface WeeklyPoint {
  week: string;
  realistic_gw: number | null;
  found_gw: number | null;
  projects: number;
}

export interface Summary {
  as_of: string;
  ercot: ErcotPoint | null;
  found_gw: number | null;
  realistic_gw: number | null;
  shadow_gw: number | null; // requested − found: our public-record coverage gap, not phantom load
  phantom_gw: number | null; // requested − approved: queue load ERCOT has not approved to energize
  projects: number;
  projects_with_mw: number;
  weekly: WeeklyPoint[];
}

export interface ParentRow {
  name: string;
  color: string | null;
  mw_total: number | null;
  mw_weighted: number | null;
  mw_verified: number | null;
  projects: number;
}

export interface ScorePoint {
  ts: string;
  score: number;
  probability: number;
  mw_est: number | null;
  factors: Record<string, boolean>;
}

export interface EvidenceEvent {
  ts: string;
  source: string;
  event_type: string;
  value_num: number | null;
  payload: Record<string, unknown> | null;
  source_url: string | null;
}

export interface ProjectInfo {
  project_id: number;
  name: string;
  county: string | null;
  city: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  site_id: number | null;
  site_name: string | null;
  location_source_url: string | null;
  location_method: string | null;
  location_precision: string | null;
  location_confidence: number | null;
  current_status: string | null;
  status_observed_at: string | null;
  llc_name: string | null;
  resolved_by: string | null;
  entity_source_url: string | null;
  parent: string | null;
  parent_color: string | null;
  is_sample: boolean;
}

export interface Timeline {
  as_of: string;
  project: ProjectInfo & Partial<Project>;
  scores: ScorePoint[];
  events: EvidenceEvent[];
}

export interface FactorConfig {
  key: string;
  points: number;
  event_type: string;
  min_count?: number;
  min_sum?: number;
  rule: string;
}

export interface ScoringConfig {
  as_of: string;
  factors: FactorConfig[];
  mw_cost_per_mw_usd: number | null;
  mw_cost_source: string | null;
  backfill_start: string | null;
  computed_at: string | null;
  tier_thresholds: { verified: number; likely: number };
  latest_score_date: string | null;
}

export interface AskResponse {
  answer: string;
  map_filter: { ids: number[]; fit_bounds: boolean } | null;
  open_timeline: number | null;
  tool_calls: { name: string; args: Record<string, unknown> }[];
}

// ---------------------------------------------------------------------------
// Public research pages (search, organization/site profiles, nearby)
// ---------------------------------------------------------------------------

/** One site with everything the public pages show. Scored fields are null before the first score. */
export interface Site {
  project_id: number;
  name: string;
  county: string | null;
  city: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  is_sample: boolean;
  llc_name: string | null;
  resolved_by: string | null;
  entity_source_url: string | null;
  parent: string | null;
  parent_color: string | null;
  scored_at: string | null;
  score: number | null;
  probability: number | null;
  tier: Tier | null;
  mw_est: number | null;
  total_cost: number | null;
  sqft: number | null;
  tdlr_registrations: number;
  certified_at: string | null;
  program: string | null;
  tenants: string[];
  has_permit: boolean;
  inspected: boolean;
  first_evidence: string | null;
  last_evidence: string | null;
  sources: string[];
}

export type SearchKind = "org" | "site" | "entity" | "city" | "county" | "zip" | "place";

export interface SearchHit {
  kind: SearchKind;
  label: string;
  sublabel: string;
  href: string;
  is_sample?: boolean;
}

export interface SearchResults {
  q: string;
  hits: SearchHit[];
}

export interface OrgEntity {
  llc_name: string;
  resolved_by: string | null;
  source_url: string | null;
  sites: { project_id: number; name: string }[];
}

export interface OrgTrendPoint {
  week: string;
  sites: number;
  mw: number | null;
}

export interface SourceStat {
  source: string;
  records: number;
  first: string | null;
  last: string | null;
  retrieved: string | null;
}

export interface OrgProfile {
  as_of: string;
  name: string;
  slug: string;
  color: string | null;
  sites: Site[];
  entities: OrgEntity[];
  trend: OrgTrendPoint[];
  sources: SourceStat[];
  comparison: {
    orgs_ranked: number;
    rank_sites: number | null;
    rank_mw: number | null;
    total_sites: number;
    total_mw: number | null;
    median_sites: number | null;
  };
  computed_at: string | null;
}

export interface GeocodeResult {
  ok: true;
  label: string;
  lat: number;
  lon: number;
  method: "coordinates" | "dataset" | "census" | "osm";
  /** County name when the match is a county (sites without coordinates are listed for it). */
  county: string | null;
}

export interface GeocodeFailure {
  ok: false;
  reason: "not_found" | "outside_texas" | "lookup_failed";
  message: string;
}

export interface NearbySite extends Site {
  distance_km: number;
  direction: string;
}

export interface NearbyResult {
  as_of: string;
  center: { lat: number; lon: number; label: string };
  radius_mi: number;
  sites: NearbySite[];
  /** Sites in the matched county whose exact location is unknown. */
  unlocated: Site[];
  total_located: number;
  /** Closest located site when none fall inside the radius. */
  nearest: NearbySite | null;
}
