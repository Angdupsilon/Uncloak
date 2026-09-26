-- Queue timeline: ERCOT's reported large-load queue vs. what public records support, week by week.
-- Run after 001-003:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/004_queue_timeline.sql
--
-- One row per week of weekly_realistic_demand (the continuous aggregate rollup). Each week
-- carries the latest ERCOT queue report dated on or before that week's Monday score date
-- (an as-of join, so a monthly ERCOT report is carried forward until the next one), plus:
--   shadow_gw           ERCOT requested - found in public records
--   realistic_gw_delta  change in evidence-weighted GW vs. the previous week
--   projects_up         projects whose evidence index rose vs. the previous week
--   projects_new        projects with their first evidence that week

CREATE OR REPLACE VIEW queue_timeline AS
WITH moves AS (
  SELECT week,
         COUNT(*) FILTER (WHERE prev_p IS NOT NULL AND p > prev_p) AS projects_up,
         COUNT(*) FILTER (WHERE prev_p IS NULL)                    AS projects_new
  FROM (
    SELECT week, project_id, p,
           lag(p) OVER (PARTITION BY project_id ORDER BY week) AS prev_p
    FROM weekly_project_state
  ) s
  GROUP BY week
)
SELECT d.week,
       e.ts                                                   AS ercot_ts,
       e.gw_requested,
       a.gw_approved,
       o.gw_observed_peak,
       e.source_url                                           AS ercot_source_url,
       d.found_gw,
       d.realistic_gw,
       e.gw_requested - d.found_gw                            AS shadow_gw,
       d.realistic_gw - lag(d.realistic_gw) OVER (ORDER BY d.week) AS realistic_gw_delta,
       d.projects,
       COALESCE(m.projects_up, 0)                             AS projects_up,
       COALESCE(m.projects_new, 0)                            AS projects_new
FROM weekly_realistic_demand d
LEFT JOIN moves m USING (week)
-- ercot_queue rows are sparse (a report may carry only one of the three figures), so each
-- figure is carried forward independently, like getSummary() in web/lib/queries.ts.
LEFT JOIN LATERAL (
  SELECT q.ts, q.gw_requested, q.source_url
  FROM ercot_queue q
  WHERE q.ts < d.week + INTERVAL '1 day'      -- same whole-day cutoff as project_scores
    AND q.gw_requested IS NOT NULL
  ORDER BY q.ts DESC
  LIMIT 1
) e ON true
LEFT JOIN LATERAL (
  SELECT q.gw_approved FROM ercot_queue q
  WHERE q.ts < d.week + INTERVAL '1 day' AND q.gw_approved IS NOT NULL
  ORDER BY q.ts DESC LIMIT 1
) a ON true
LEFT JOIN LATERAL (
  SELECT q.gw_observed_peak FROM ercot_queue q
  WHERE q.ts < d.week + INTERVAL '1 day' AND q.gw_observed_peak IS NOT NULL
  ORDER BY q.ts DESC LIMIT 1
) o ON true;

-- The web app reads through the read-only role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gridsight_ro') THEN
    EXECUTE 'GRANT SELECT ON queue_timeline TO gridsight_ro';
  END IF;
END $$;
