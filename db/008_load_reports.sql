-- Data-center load reports by region (generalizes ercot_queue). Run once on a database created before it:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/008_load_reports.sql -f db/004_queue_timeline.sql
-- (004 is re-run because queue_timeline reads ercot_queue, which becomes a view here.)
-- Existing ERCOT rows are copied over; load data/seed/dc_load_reports.csv afterwards for the quotes.

ALTER TABLE grid_regions DROP CONSTRAINT IF EXISTS grid_regions_kind_check;
ALTER TABLE grid_regions ADD CONSTRAINT grid_regions_kind_check CHECK (kind IN ('ba','rto','zone','utility'));

CREATE TABLE IF NOT EXISTS dc_load_reports (
  ts             timestamptz NOT NULL,    -- the figure's as-of date
  region_key     text NOT NULL REFERENCES grid_regions,
  metric         text NOT NULL CHECK (metric IN ('requested','approved','observed_peak','committed','contracted',
                                                 'forecast','forecast_adjustment')),
  -- data_centers: the publisher attributes it to data centers; data_centers_and_crypto: the publisher's
  -- own combined category; large_loads_all: every large load (dc_share_pct only when the same document states it)
  scope          text NOT NULL CHECK (scope IN ('data_centers','data_centers_and_crypto','large_loads_all')),
  value_mw       double precision NOT NULL,
  forecast_year  int,                     -- the year a forecast figure is for
  stage          text,                    -- the publisher's own stage or contract label
  dc_share_pct   double precision CHECK (dc_share_pct > 0 AND dc_share_pct <= 100),
  dc_share_quote text,
  source_key     text NOT NULL,
  source_url     text NOT NULL,
  document       text,
  quote          text NOT NULL,
  CHECK ((dc_share_pct IS NULL) = (dc_share_quote IS NULL)),
  CHECK (dc_share_pct IS NULL OR scope = 'large_loads_all')
);
CREATE UNIQUE INDEX IF NOT EXISTS dc_load_reports_key
  ON dc_load_reports (ts, region_key, metric, scope, COALESCE(forecast_year, 0), COALESCE(stage, ''), source_key);
CREATE INDEX IF NOT EXISTS dc_load_reports_region_idx ON dc_load_reports (region_key, metric, ts DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ercot_queue') THEN
    INSERT INTO grid_regions (region_key, kind, name, source_url)
    VALUES ('ERCO', 'ba', 'Electric Reliability Council of Texas, Inc.', 'https://www.ercot.com/')
    ON CONFLICT (region_key) DO NOTHING;
    INSERT INTO dc_load_reports (ts, region_key, metric, scope, value_mw, source_key, source_url, quote)
    SELECT ts, 'ERCO', m.metric, 'large_loads_all', m.gw * 1000, 'ERCOT', COALESCE(source_url, 'https://www.ercot.com/'),
           'migrated from ercot_queue; reload data/seed/dc_load_reports.csv for the document quote'
    FROM ercot_queue, LATERAL (VALUES ('requested', gw_requested), ('approved', gw_approved),
                                      ('observed_peak', gw_observed_peak)) m(metric, gw)
    WHERE m.gw IS NOT NULL
    ON CONFLICT DO NOTHING;
    DROP VIEW IF EXISTS queue_timeline;
    DROP TABLE ercot_queue;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('dc_load_reports', 'ts', if_not_exists => true, migrate_data => true);
  END IF;
END $$;

-- Compatibility view: the ERCOT queue in its original shape (GW), for queue_timeline and /api/summary.
CREATE OR REPLACE VIEW ercot_queue AS
SELECT ts,
       MAX(value_mw) FILTER (WHERE metric = 'requested')     / 1000.0 AS gw_requested,
       MAX(value_mw) FILTER (WHERE metric = 'approved')      / 1000.0 AS gw_approved,
       MAX(value_mw) FILTER (WHERE metric = 'observed_peak') / 1000.0 AS gw_observed_peak,
       MIN(source_url)                                                AS source_url
FROM dc_load_reports
WHERE region_key = 'ERCO' AND source_key = 'ERCOT' AND scope = 'large_loads_all'
GROUP BY ts;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gridsight_ro') THEN
    EXECUTE 'GRANT SELECT ON dc_load_reports, ercot_queue TO gridsight_ro';
  END IF;
END $$;
