-- Additive migration for databases created before the canonical-site/data-quality model.
-- Safe to rerun.

CREATE TABLE IF NOT EXISTS sites (
  site_id serial PRIMARY KEY, site_key text NOT NULL UNIQUE, name text NOT NULL,
  county text, city text, address text, lat double precision, lon double precision,
  location_source_url text, location_method text, location_precision text,
  location_confidence double precision CHECK (location_confidence BETWEEN 0 AND 1),
  location_basis text, reviewed_at date
);
CREATE TABLE IF NOT EXISTS project_sites (
  project_id int PRIMARY KEY REFERENCES projects ON DELETE CASCADE,
  site_id int NOT NULL REFERENCES sites ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'registration'
);
CREATE TABLE IF NOT EXISTS project_status_history (
  project_id int NOT NULL REFERENCES projects ON DELETE CASCADE,
  observed_at date NOT NULL, status text NOT NULL, raw_status text,
  source text NOT NULL, source_url text,
  PRIMARY KEY (project_id, observed_at, source, status)
);
CREATE TABLE IF NOT EXISTS entity_parent_history (
  entity_id int NOT NULL REFERENCES entities ON DELETE CASCADE,
  observed_at date NOT NULL, valid_from date, valid_to date,
  parent_id int REFERENCES parents, resolved_by text, source_url text,
  PRIMARY KEY (entity_id, observed_at)
);
CREATE TABLE IF NOT EXISTS capacity_observations (
  capacity_id serial PRIMARY KEY, project_id int NOT NULL REFERENCES projects ON DELETE CASCADE,
  observed_at date NOT NULL, mw double precision NOT NULL CHECK (mw > 0),
  capacity_type text NOT NULL CHECK (capacity_type IN ('actual','announced','interconnection','modeled')),
  source_url text NOT NULL, notes text,
  UNIQUE (project_id, observed_at, capacity_type, source_url)
);
CREATE TABLE IF NOT EXISTS ercot_project_links (
  project_id int NOT NULL REFERENCES projects ON DELETE CASCADE,
  ercot_project_id text NOT NULL, observed_at date NOT NULL, status text,
  requested_mw double precision, approved_mw double precision, energized_mw double precision,
  confidence double precision NOT NULL CHECK (confidence BETWEEN 0 AND 1), source_url text NOT NULL,
  PRIMARY KEY (project_id, ercot_project_id, observed_at)
);
CREATE TABLE IF NOT EXISTS source_refreshes (
  source text NOT NULL, retrieved_at date NOT NULL, record_count int NOT NULL CHECK (record_count >= 0),
  source_url text NOT NULL, snapshot_file text NOT NULL,
  PRIMARY KEY (source, retrieved_at, snapshot_file)
);
CREATE INDEX IF NOT EXISTS project_sites_site_idx ON project_sites (site_id);
CREATE INDEX IF NOT EXISTS project_status_latest_idx ON project_status_history (project_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS entity_parent_latest_idx ON entity_parent_history (entity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS capacity_latest_idx ON capacity_observations (project_id, observed_at DESC);

GRANT SELECT ON sites, project_sites, project_status_history, entity_parent_history,
  capacity_observations, ercot_project_links, source_refreshes TO gridsight_ro;
