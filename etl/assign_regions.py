"""Tag each canonical site with its county FIPS and the balancing authorities EIA-861 lists there.

Reads the two files etl/import_grid_regions.py writes:
  data/raw/project_counties.csv          project -> county FIPS (spatial join or the record's county)
  data/raw/eia861_ba_county_<y>_<d>.csv  county FIPS -> balancing authorities (EIA-861, via PUDL)
and fills sites.county_fips / county_method, grid_regions and site_regions. Runs after
sync_dimensions.py, which rebuilds the sites table.

Rules:
  - A site takes the county of its member projects. If they name different counties, or a project's
    coordinates changed since import_grid_regions.py ran, the site is left untagged (with a warning).
  - A county with n balancing authorities gives the site n rows with confidence 1/n: EIA-861 says
    the county is served by these, not which one serves the site.
  - No EIA-861 rows for the county (Puerto Rico) means no tag: the lookup isn't published there.
This is a lookup only. No grid demand figure is stored or derived from it.

Usage: python etl/assign_regions.py
"""
from __future__ import annotations

import csv
import re
from collections import defaultdict

import config
from common import connect

RAW = config.ROOT / "data" / "raw"
EIA861_URL = "https://www.eia.gov/electricity/data/eia861/"


def ba_file():
    files = sorted(RAW.glob("eia861_ba_county_*_*.csv"))
    if not files:
        raise SystemExit("no data/raw/eia861_ba_county_*.csv: run etl/import_grid_regions.py first")
    return files[-1]


def main() -> None:
    path = ba_file()
    year = re.search(r"eia861_ba_county_(\d{4})_", path.name).group(1)
    with path.open(newline="", encoding="utf-8") as f:
        territory = list(csv.DictReader(f))
    counties_path = RAW / "project_counties.csv"
    with counties_path.open(newline="", encoding="utf-8") as f:
        by_project = {r["project_name"]: r for r in csv.DictReader(f)}

    served: dict[str, list[str]] = defaultdict(list)
    regions: dict[str, tuple[str, int]] = {}
    for t in territory:
        key = t["ba_code"] or f"EIA-BA-{t['ba_id_eia']}"
        regions[key] = (t["ba_name"] or key, int(t["ba_id_eia"]))
        if key not in served[t["county_fips"]]:
            served[t["county_fips"]].append(key)

    with connect() as conn, conn.cursor() as cur:
        for key, (name, eia_id) in sorted(regions.items()):
            cur.execute("""INSERT INTO grid_regions (region_key, kind, name, eia_id, source_url)
                           VALUES (%s, 'ba', %s, %s, %s)
                           ON CONFLICT (region_key) DO UPDATE SET name = EXCLUDED.name, eia_id = EXCLUDED.eia_id,
                             source_url = EXCLUDED.source_url""", (key, name, eia_id, EIA861_URL))
        cur.execute("""SELECT ps.site_id, p.name, p.lat, p.lon FROM project_sites ps
                       JOIN projects p USING (project_id) ORDER BY ps.site_id""")
        members: dict[int, list[tuple]] = defaultdict(list)
        for site_id, name, lat, lon in cur.fetchall():
            members[site_id].append((name, lat, lon))

        cur.execute("DELETE FROM site_regions")
        cur.execute("UPDATE sites SET county_fips = NULL, county_method = NULL")
        tagged = multi = no_ba = conflicts = stale = 0
        for site_id, rows in members.items():
            found = set()
            for name, lat, lon in rows:
                r = by_project.get(name)
                if not r or not r["county_fips"]:
                    continue
                if r["method"] == "spatial_join" and (lat is None or abs(float(r["lat"]) - lat) > 1e-6
                                                      or abs(float(r["lon"]) - lon) > 1e-6):
                    stale += 1
                    print(f"  WARN {name!r}: coordinates changed since import_grid_regions.py ran; not tagged")
                    continue
                found.add((r["county_fips"], r["method"], r["eia861_fips"], r["eia861_match"]))
            if len({f[0] for f in found}) != 1:
                if len({f[0] for f in found}) > 1:
                    conflicts += 1
                    print(f"  WARN site {site_id}: member projects are in different counties {sorted(found)}; not tagged")
                continue
            fips, method, eia_fips, match = sorted(found)[0]
            cur.execute("UPDATE sites SET county_fips = %s, county_method = %s WHERE site_id = %s", (fips, method, site_id))
            keys = served.get(eia_fips, []) if eia_fips else []
            if not keys:
                no_ba += 1
                continue
            for key in keys:
                cur.execute("""INSERT INTO site_regions (site_id, region_key, method, confidence, county_fips, source_url)
                               VALUES (%s, %s, %s, %s, %s, %s)""",
                            (site_id, key, f"eia861_{year}_county_{'fips' if match == 'fips' else 'name'}", 1 / len(keys), eia_fips, EIA861_URL))
            tagged += 1
            multi += len(keys) > 1
    print(f"  regions: {tagged} sites tagged from EIA-861 {year} ({multi} in counties with several balancing "
          f"authorities), {no_ba} in counties EIA-861 doesn't cover, {conflicts} county conflicts, {stale} stale")


if __name__ == "__main__":
    main()
