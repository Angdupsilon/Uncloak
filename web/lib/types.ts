import type { Tier } from "./constants";

export interface Project {
  project_id: number;
  name: string;
  county: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
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
  ts: string;
  gw_requested: number | null;
  gw_approved: number | null;
  gw_observed_peak: number | null;
  source_url: string | null;
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
  shadow_gw: number | null;
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
