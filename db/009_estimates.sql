-- Modeled estimates (docs/us-expansion-plan.md, Phase 4). Kept apart from documented values: nothing in
-- scoring reads these tables. Additive and safe to rerun:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/009_estimates.sql

-- One row per model version: its parameters, training rows and backtest (validation) results.
CREATE TABLE IF NOT EXISTS estimate_methods (
  method          text NOT NULL,
  method_version  text NOT NULL,
  fitted_at       timestamptz NOT NULL,
  description     text NOT NULL,
  params          jsonb NOT NULL,   -- e.g. the 10th/50th/90th percentiles of MW per sq ft
  validation      jsonb NOT NULL,   -- e.g. leave-one-out median absolute % error, interval coverage
  training        jsonb NOT NULL,   -- the training rows (project name, inputs, target)
  PRIMARY KEY (method, method_version)
);

-- A range (low / mid / high) per subject, never a single number, with the inputs that produced it.
CREATE TABLE IF NOT EXISTS estimates (
  estimate_id     serial PRIMARY KEY,
  subject_kind    text NOT NULL CHECK (subject_kind IN ('project','site','state','region')),
  project_id      int REFERENCES projects ON DELETE CASCADE,   -- set for subject_kind = 'project'
  metric          text NOT NULL,                               -- it_mw
  as_of           date NOT NULL,
  low             double precision NOT NULL,
  mid             double precision NOT NULL,
  high            double precision NOT NULL,
  unit            text NOT NULL,
  method          text NOT NULL,
  method_version  text NOT NULL,
  inputs          jsonb NOT NULL,
  notes           text,
  CHECK (low <= mid AND mid <= high),
  CHECK (subject_kind <> 'project' OR project_id IS NOT NULL),
  FOREIGN KEY (method, method_version) REFERENCES estimate_methods ON DELETE CASCADE,
  UNIQUE (subject_kind, project_id, metric, method, method_version, as_of)
);
CREATE INDEX IF NOT EXISTS estimates_project_idx ON estimates (project_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gridsight_ro') THEN
    EXECUTE 'GRANT SELECT ON estimate_methods, estimates TO gridsight_ro';
  END IF;
END $$;
