-- Spare-capacity finder: existing plants, their grid-connection size, and hourly output.
-- Additive and safe to rerun. Needs timescaledb and timescaledb_toolkit (both on Tiger Cloud).
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/005_spare_capacity.sql

CREATE EXTENSION IF NOT EXISTS timescaledb_toolkit;

-- One row per plant. connection_mw is the size of the grid connection (the most the
-- site may inject), which is what a co-located project would share.
CREATE TABLE IF NOT EXISTS power_plants (
  plant_id        text PRIMARY KEY,                -- EIA plant code for real rows, SAMPLE-* for fixtures
  name            text NOT NULL,
  owner           text,
  technology      text NOT NULL CHECK (technology IN ('peaker','gas_cc','steam','solar','wind')),
  fuel            text,
  connection_mw   double precision NOT NULL CHECK (connection_mw > 0),
  region          text NOT NULL,                   -- grid operator, e.g. ERCOT
  county          text,
  lat             double precision,
  lon             double precision,
  operating_year  int,
  retirement_year int,                             -- planned retirement, when reported
  open_acres      double precision,                -- adjacent open land (parcel data)
  fiber_within_2mi boolean,
  water_nearby    boolean,
  output_source   text NOT NULL CHECK (output_source IN ('CAMPD','EIA923_MODELED','SAMPLE')),
  source_url      text NOT NULL,
  is_sample       boolean NOT NULL DEFAULT false
);

-- Hourly net output per plant. CAMPD reports hourly gross load for fossil units;
-- solar and wind are modeled from weather and EIA-923 monthly generation.
CREATE TABLE IF NOT EXISTS plant_output (
  ts        timestamptz NOT NULL,                  -- start of the hour, UTC
  plant_id  text NOT NULL REFERENCES power_plants ON DELETE CASCADE,
  output_mw double precision NOT NULL CHECK (output_mw >= 0),
  PRIMARY KEY (plant_id, ts)
);
SELECT create_hypertable('plant_output', by_range('ts', INTERVAL '30 days'), if_not_exists => true);

-- Columnar compression: a year of hourly rows per plant compresses well when
-- segmented by plant. Skipped if already configured.
DO $$
BEGIN
  ALTER TABLE plant_output SET (timescaledb.compress,
                                timescaledb.compress_segmentby = 'plant_id',
                                timescaledb.compress_orderby = 'ts DESC');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'plant_output compression already configured: %', SQLERRM;
END $$;
SELECT add_compression_policy('plant_output', INTERVAL '60 days', if_not_exists => true);

-- Daily rollup in ERCOT local time. The UddSketch (percentile_agg) lets the API
-- answer "how many MW are free in 80% of hours over the last year" by rolling up
-- 365 daily sketches instead of sorting ~8,760 raw rows per plant.
CREATE MATERIALIZED VIEW IF NOT EXISTS plant_output_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', ts, 'America/Chicago') AS day,
       plant_id,
       count(*)               AS hours,
       avg(output_mw)         AS avg_mw,
       max(output_mw)         AS max_mw,
       percentile_agg(output_mw) AS pct
FROM plant_output
GROUP BY 1, 2
WITH NO DATA;

SELECT add_continuous_aggregate_policy('plant_output_daily',
  start_offset => INTERVAL '90 days', end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day', if_not_exists => true);

-- Read-only web role (created by 003_readonly_role.sql).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gridsight_ro') THEN
    GRANT SELECT ON power_plants, plant_output, plant_output_daily TO gridsight_ro;
  END IF;
END $$;
