-- National coverage: a state on every project and canonical site. Additive and safe to rerun.
-- Run once on a database created before this column existed:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/006_national.sql -f db/004_queue_timeline.sql
-- (004 is re-run because its view now reads projects.state.)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS state char(2) NOT NULL DEFAULT 'TX';
ALTER TABLE sites    ADD COLUMN IF NOT EXISTS state char(2);
CREATE INDEX IF NOT EXISTS projects_state_idx ON projects (state);

-- ERCOT is the Texas grid, so the figures compared with its queue count Texas projects with a
-- public record (atlas-only sites, whose sole evidence is `site_mapped`, are left out).
CREATE OR REPLACE VIEW weekly_realistic_demand AS
SELECT w.week,
       SUM(w.p * COALESCE(w.mw,0)) / 1000.0 AS realistic_gw,
       SUM(COALESCE(w.mw,0))       / 1000.0 AS found_gw,
       COUNT(*)                             AS projects
FROM weekly_project_state w
JOIN projects pr ON pr.project_id = w.project_id AND pr.state = 'TX'
  AND EXISTS (SELECT 1 FROM evidence_events x WHERE x.project_id = w.project_id AND x.event_type <> 'site_mapped')
GROUP BY w.week;
