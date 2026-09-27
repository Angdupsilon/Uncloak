-- Rebuild the spare-capacity daily aggregate with fixed CST day boundaries.
-- CAMPD timestamps are local standard time, so Chicago daylight-saving buckets split
-- the final reporting hour into the following day. Base plant_output data is preserved.

DROP MATERIALIZED VIEW IF EXISTS plant_output_daily;

CREATE MATERIALIZED VIEW plant_output_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', ts, TIMESTAMPTZ '1970-01-01 06:00:00+00') AS day,
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gridsight_ro') THEN
    GRANT SELECT ON plant_output_daily TO gridsight_ro;
  END IF;
END $$;
