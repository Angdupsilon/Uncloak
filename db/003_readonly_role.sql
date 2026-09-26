-- Read-only role for the web app (DATABASE_URL_RO). ETL keeps using the owner role.
-- Set the password before running, e.g.:
--   psql "$DATABASE_URL" -v ro_password="'...'" -f db/003_readonly_role.sql
-- If ro_password is not supplied the role is created without a password and you must
-- run ALTER ROLE gridsight_ro PASSWORD '...' yourself.

\if :{?ro_password}
CREATE ROLE gridsight_ro LOGIN PASSWORD :ro_password;
\else
CREATE ROLE gridsight_ro LOGIN;
\endif

GRANT USAGE ON SCHEMA public TO gridsight_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gridsight_ro;   -- includes views and the continuous aggregate
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO gridsight_ro;

-- Explicit grant on the continuous aggregate (Timescale propagates it to the
-- materialization hypertable). The internal-schema grant is a best-effort fallback
-- for older Timescale versions; it is skipped if the owner role may not grant it.
GRANT SELECT ON weekly_project_state TO gridsight_ro;
DO $$
BEGIN
  EXECUTE 'GRANT USAGE ON SCHEMA _timescaledb_internal TO gridsight_ro';
  EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA _timescaledb_internal TO gridsight_ro';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping _timescaledb_internal grants: %', SQLERRM;
END $$;

ALTER ROLE gridsight_ro SET statement_timeout = '3s';
