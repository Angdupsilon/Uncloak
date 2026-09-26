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
  resolved_by text,                     -- 'COMPTROLLER' | 'TDLR_TENANT' | 'TDLR_OWNER' | 'OSM_OPERATOR' | 'MANUAL'
  source_url  text
);

CREATE TABLE projects (
  project_id  serial PRIMARY KEY,
  name        text NOT NULL,
  state       char(2) NOT NULL DEFAULT 'TX', -- USPS code; Texas seeds predate the column
  county      text,
  city        text,
  address     text,
  lat         double precision,
  lon         double precision,
  entity_id   int REFERENCES entities,
  is_sample   boolean NOT NULL DEFAULT false
);

-- A project is a public-record object; a site is the physical campus it refers to.
-- Several registrations/buildings can therefore belong to one canonical site.
CREATE TABLE sites (
  site_id              serial PRIMARY KEY,
  site_key             text NOT NULL UNIQUE,
  name                 text NOT NULL,
  state                char(2),
  county               text,
  city                 text,
  address              text,
  lat                  double precision,
  lon                  double precision,
  location_source_url  text,
  location_method      text,
  location_precision   text,
  location_confidence  double precision CHECK (location_confidence BETWEEN 0 AND 1),
  location_basis       text,
  reviewed_at          date
);

CREATE TABLE project_sites (
  project_id    int PRIMARY KEY REFERENCES projects ON DELETE CASCADE,
  site_id       int NOT NULL REFERENCES sites ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'registration'
);

CREATE TABLE project_status_history (
  project_id    int NOT NULL REFERENCES projects ON DELETE CASCADE,
  observed_at   date NOT NULL,
  status        text NOT NULL,
  raw_status    text,
  source        text NOT NULL,
  source_url    text,
  PRIMARY KEY (project_id, observed_at, source, status)
);

CREATE TABLE entity_parent_history (
  entity_id     int NOT NULL REFERENCES entities ON DELETE CASCADE,
  observed_at   date NOT NULL,
  valid_from    date,
  valid_to      date,
  parent_id     int REFERENCES parents,
  resolved_by   text,
  source_url    text,
  PRIMARY KEY (entity_id, observed_at)
);

CREATE TABLE capacity_observations (
  capacity_id   serial PRIMARY KEY,
  project_id    int NOT NULL REFERENCES projects ON DELETE CASCADE,
  observed_at   date NOT NULL,
  mw            double precision NOT NULL CHECK (mw > 0),
  capacity_type text NOT NULL CHECK (capacity_type IN ('actual','announced','interconnection','modeled')),
  source_url    text NOT NULL,
  notes         text,
  UNIQUE (project_id, observed_at, capacity_type, source_url)
);

CREATE TABLE ercot_project_links (
  project_id       int NOT NULL REFERENCES projects ON DELETE CASCADE,
  ercot_project_id text NOT NULL,
  observed_at      date NOT NULL,
  status           text,
  requested_mw     double precision,
  approved_mw      double precision,
  energized_mw     double precision,
  confidence       double precision NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source_url       text NOT NULL,
  PRIMARY KEY (project_id, ercot_project_id, observed_at)
);

CREATE TABLE source_refreshes (
  source         text NOT NULL,
  retrieved_at   date NOT NULL,
  record_count   int NOT NULL CHECK (record_count >= 0),
  source_url     text NOT NULL,
  snapshot_file  text NOT NULL,
  PRIMARY KEY (source, retrieved_at, snapshot_file)
);

CREATE TABLE evidence_events (
  ts          timestamptz NOT NULL,     -- real-world date of the evidence
  project_id  int NOT NULL REFERENCES projects,
  source      text NOT NULL,            -- 'TDLR' | 'COMPTROLLER' | 'TCEQ' | 'OSM' | 'OTHER'
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
CREATE INDEX projects_state_idx           ON projects (state);
CREATE INDEX project_sites_site_idx       ON project_sites (site_id);
CREATE INDEX project_status_latest_idx    ON project_status_history (project_id, observed_at DESC);
CREATE INDEX entity_parent_latest_idx     ON entity_parent_history (entity_id, observed_at DESC);
CREATE INDEX capacity_latest_idx          ON capacity_observations (project_id, observed_at DESC);
