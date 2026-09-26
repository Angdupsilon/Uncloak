-- Grid-operator tag: which balancing authority serves the county a site is in. Lookup only; no grid
-- demand is stored. Additive and safe to rerun:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/007_site_regions.sql

ALTER TABLE sites ADD COLUMN IF NOT EXISTS county_fips   char(5);  -- 2010-vintage Census FIPS (as EIA-861 uses)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS county_method text;     -- spatial_join | record_county

-- Balancing authorities (and, later, utilities or RTOs that publish data-center load reports).
CREATE TABLE IF NOT EXISTS grid_regions (
  region_key  text PRIMARY KEY,             -- EIA BA code (PJM, ERCO, MISO, ...) or EIA-BA-<id> when EIA gives no code
  kind        text NOT NULL CHECK (kind IN ('ba','rto','utility')),
  name        text NOT NULL,
  eia_id      int,
  source_url  text NOT NULL
);

-- Every balancing authority EIA-861 lists for the site's county. With n of them, each row has
-- confidence 1/n: the county is served by one of n, and which one serves this site isn't published.
CREATE TABLE IF NOT EXISTS site_regions (
  site_id      int  NOT NULL REFERENCES sites ON DELETE CASCADE,
  region_key   text NOT NULL REFERENCES grid_regions,
  method       text NOT NULL,               -- eia861_<year>_county_fips | eia861_<year>_county_name
  confidence   double precision NOT NULL CHECK (confidence > 0 AND confidence <= 1),
  county_fips  char(5) NOT NULL,            -- the EIA-861 county rows used
  source_url   text NOT NULL,
  PRIMARY KEY (site_id, region_key)
);
CREATE INDEX IF NOT EXISTS site_regions_region_idx ON site_regions (region_key);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gridsight_ro') THEN
    EXECUTE 'GRANT SELECT ON grid_regions, site_regions TO gridsight_ro';
  END IF;
END $$;
