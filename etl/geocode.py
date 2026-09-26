"""Fill missing lat/lon using the U.S. Census batch geocoder.

Only projects that have an address but no coordinates are sent. Unmatched
addresses are printed for manual review; nothing is guessed.

Usage: python etl/geocode.py
"""
from __future__ import annotations

import csv
import io

import httpx

from common import connect

CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
BENCHMARK = "Public_AR_Current"
BATCH_LIMIT = 10_000  # Census batch limit per request


def main() -> int:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""SELECT project_id, address, city FROM projects
                       WHERE (lat IS NULL OR lon IS NULL) AND address IS NOT NULL""")
        todo = cur.fetchall()
        if not todo:
            print("  geocode: nothing to do")
            return 0
        updated = 0
        for start in range(0, len(todo), BATCH_LIMIT):
            chunk = todo[start:start + BATCH_LIMIT]
            buf = io.StringIO()
            w = csv.writer(buf)
            for pid, address, city in chunk:
                w.writerow([pid, address, city or "", "TX", ""])
            try:
                resp = httpx.post(
                    CENSUS_URL,
                    data={"benchmark": BENCHMARK},
                    files={"addressFile": ("addresses.csv", buf.getvalue(), "text/csv")},
                    timeout=120,
                )
                resp.raise_for_status()
            except httpx.HTTPError as e:
                print(f"  geocode: Census request failed ({e}); leaving coordinates empty")
                return updated
            for rec in csv.reader(io.StringIO(resp.text)):
                if len(rec) < 6:
                    continue
                pid, match, coords = rec[0], rec[2], rec[5]
                if match != "Match" or "," not in coords:
                    print(f"  geocode: no match for project {pid}: {rec[1]}")
                    continue
                lon, lat = (float(x) for x in coords.split(","))
                cur.execute("UPDATE projects SET lat = %s, lon = %s WHERE project_id = %s", (lat, lon, int(pid)))
                updated += 1
        print(f"  geocode: updated {updated} of {len(todo)} projects")
        return updated


if __name__ == "__main__":
    main()
