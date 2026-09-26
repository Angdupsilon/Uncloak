"""Fill missing lat/lon from public geocoders.

Only projects that have an address but no coordinates are geocoded.
  1. U.S. Census batch geocoder.
  2. For addresses the Census can't place: OpenStreetMap Nominatim (at most 1 request per
     second, per its usage policy). A result is accepted only if it matches the address's
     house number and the project's county, never a road or area centroid, which can be
     miles away.
Unmatched addresses are printed for manual review; nothing is guessed.

Usage: python etl/geocode.py [--no-osm]
"""
from __future__ import annotations

import argparse
import csv
import io
import re
import time

import httpx

from common import connect

# Nominatim wants a state name; the Census batch geocoder takes the USPS code.
STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "PR": "Puerto Rico", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia",
    "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}

CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
BENCHMARK = "Public_AR_Current"
BATCH_LIMIT = 10_000  # Census batch limit per request
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_UA = "GridSight (hackathon prototype; geocoding public TDLR project addresses)"


def census(todo: list[tuple]) -> dict[int, tuple[float, float]]:
    found: dict[int, tuple[float, float]] = {}
    for start in range(0, len(todo), BATCH_LIMIT):
        buf = io.StringIO()
        w = csv.writer(buf)
        for pid, address, city, _county, state in todo[start:start + BATCH_LIMIT]:
            w.writerow([pid, address, city or "", state, ""])
        try:
            resp = httpx.post(CENSUS_URL, data={"benchmark": BENCHMARK},
                              files={"addressFile": ("addresses.csv", buf.getvalue(), "text/csv")}, timeout=120)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            print(f"  geocode: Census request failed ({e})")
            return found
        for rec in csv.reader(io.StringIO(resp.text)):
            if len(rec) >= 6 and rec[2] == "Match" and "," in rec[5]:
                lon, lat = (float(x) for x in rec[5].split(","))
                found[int(rec[0])] = (lat, lon)
    return found


def nominatim(todo: list[tuple]) -> dict[int, tuple[float, float]]:
    found: dict[int, tuple[float, float]] = {}
    with httpx.Client(headers={"User-Agent": NOMINATIM_UA}, timeout=30) as client:
        for pid, address, city, county, state in todo:
            number = re.match(r"\s*(\d+)\b", address or "")
            if not number:
                continue  # no house number to verify against, so skip
            params = {"street": address, "city": city or "", "state": STATE_NAMES.get(state, state), "country": "USA",
                      "format": "jsonv2", "addressdetails": 1, "limit": 1}
            if county:
                params["county"] = f"{county} County"
            try:
                hits = client.get(NOMINATIM_URL, params=params).json()
            except (httpx.HTTPError, ValueError) as e:
                print(f"  geocode: OSM request failed for project {pid} ({e})")
                hits = []
            time.sleep(1.1)
            if not hits:
                continue
            a = hits[0].get("address", {})
            same_number = a.get("house_number") == number.group(1)
            same_county = not county or (a.get("county", "").lower().replace(" county", "") == county.lower())
            if same_number and same_county:
                found[pid] = (float(hits[0]["lat"]), float(hits[0]["lon"]))
    return found


def main(use_osm: bool = True) -> int:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""SELECT project_id, address, city, county, state FROM projects
                       WHERE (lat IS NULL OR lon IS NULL) AND address IS NOT NULL""")
        todo = cur.fetchall()
        if not todo:
            print("  geocode: nothing to do")
            return 0
        found = census(todo)
        n_census = len(found)
        if use_osm:
            found.update(nominatim([t for t in todo if t[0] not in found]))
        for pid, (lat, lon) in found.items():
            cur.execute("UPDATE projects SET lat = %s, lon = %s WHERE project_id = %s", (lat, lon, pid))
        for pid, address, city, *_ in todo:
            if pid not in found:
                print(f"  geocode: no address-level match for project {pid}: {address}, {city or ''}")
        print(f"  geocode: updated {len(found)} of {len(todo)} projects "
              f"({n_census} Census, {len(found) - n_census} OpenStreetMap)")
        return len(found)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-osm", action="store_true", help="Census geocoder only")
    main(not ap.parse_args().no_osm)
