-- GridSight core schema. Run as the owner role against Tiger Cloud (PostgreSQL + TimescaleDB).

CREATE TABLE parents (
  parent_id   serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  color_hex   text                      -- for map filter chips
);

CREATE TABLE entities (
  entity_id   serial PRIMARY KEY,
  llc_name    text NOT NULL,
  parent_id   int REFERENCES parents,
  resolved_by text,                     -- 'COMPTROLLER' | 'TDLR_TENANT' | 'MANUAL'
  source_url  text
);

CREATE TABLE projects (
  project_id  serial PRIMARY KEY,
  name        text NOT NULL,
  county      text,
  city        text,
  address     text,
  lat         double precision,
  lon         double precision,
  entity_id   int REFERENCES entities,
  is_sample   boolean NOT NULL DEFAULT false
);

CREATE TABLE evidence_events (
  ts          timestamptz NOT NULL,     -- real-world date of the evidence
  project_id  int NOT NULL REFERENCES projects,
  source      text NOT NULL,            -- 'TDLR' | 'COMPTROLLER' | 'TCEQ' | 'OTHER'
  event_type  text NOT NULL,            -- see spec 4.3
  value_num   double precision,         -- e.g., construction cost USD, sq ft
  payload     jsonb,                    -- raw fields (record id, tenant name, etc.)
  source_url  text
);

CREATE TABLE project_scores (
  ts           timestamptz NOT NULL,    -- the as-of date
  project_id   int NOT NULL REFERENCES projects,
  score        int NOT NULL,            -- 0..100 checklist points
  probability  double precision NOT NULL,
  mw_est       double precision,        -- null if no cost data
  factors      jsonb NOT NULL           -- {"factor_key": true/false, ...}
);

CREATE TABLE ercot_queue (
  ts                timestamptz NOT NULL,
  gw_requested      double precision,
  gw_approved       double precision,
  gw_observed_peak  double precision,
  source_url        text
);

-- Addition to the spec schema: the scoring configuration used by the most recent
-- backfill (written by etl/score.py). The web app reads this for the
-- "How scoring works" popover so the UI always shows exactly what produced the scores.
CREATE TABLE scoring_config (
  id                  int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  factors             jsonb NOT NULL,   -- [{key, points, event_type, min_count|min_sum, rule}]
  mw_cost_per_mw_usd  double precision, -- null when not configured
  mw_cost_source      text,             -- 'env' | 'SAMPLE placeholder' | null
  backfill_start      date NOT NULL,
  computed_at         timestamptz NOT NULL DEFAULT now()
);

-- Helpers for idempotent loading (not required by the spec, safe to keep).
CREATE UNIQUE INDEX entities_llc_name_key ON entities (llc_name);
CREATE UNIQUE INDEX projects_name_key     ON projects (name);
