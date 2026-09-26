-- TimescaleDB features: hypertables, continuous aggregate (time_bucket + last()), views.

SELECT create_hypertable('evidence_events', 'ts');
SELECT create_hypertable('project_scores',  'ts');
SELECT create_hypertable('dc_load_reports', 'ts');

CREATE INDEX ON evidence_events (project_id, ts DESC);
CREATE INDEX ON project_scores  (project_id, ts DESC);

CREATE MATERIALIZED VIEW weekly_project_state
WITH (timescaledb.continuous) AS
SELECT time_bucket('7 days', ts) AS week,
       project_id,
       last(probability, ts) AS p,
       last(mw_est, ts)      AS mw,
       last(score, ts)       AS score
FROM project_scores
GROUP BY week, project_id;

-- ERCOT is the Texas grid, so the figures compared with its queue count Texas projects with a
-- public record (atlas-only sites, whose sole evidence is `site_mapped`, are left out).
CREATE VIEW weekly_realistic_demand AS
SELECT w.week,
       SUM(w.p * COALESCE(w.mw,0)) / 1000.0 AS realistic_gw,
       SUM(COALESCE(w.mw,0))       / 1000.0 AS found_gw,
       COUNT(*)                             AS projects
FROM weekly_project_state w
JOIN projects pr ON pr.project_id = w.project_id AND pr.state = 'TX'
  AND EXISTS (SELECT 1 FROM evidence_events x WHERE x.project_id = w.project_id AND x.event_type <> 'site_mapped')
GROUP BY w.week;

-- Optional bonus: native compression on evidence_events (see README).
-- ALTER TABLE evidence_events SET (timescaledb.compress, timescaledb.compress_segmentby = 'project_id');
-- SELECT add_compression_policy('evidence_events', INTERVAL '30 days');

-- After backfill (etl/score.py does this automatically):
-- CALL refresh_continuous_aggregate('weekly_project_state', NULL, NULL);
