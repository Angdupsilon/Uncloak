"""Tag every project with its county FIPS and write the EIA-861 grid-operator lookup.

Sources (both via Catalyst Cooperative's PUDL mirror, CC-BY-4.0; see data/raw/README.md):
  - EIA-861 balancing-authority service territory by county
    (out_eia861__yearly_balancing_authority_service_territory), one report year (REPORT_YEAR).
    The 2025 year in PUDL is partial (checked 2026-09-26: 137 counties that every year since 2020
    lists, among them DC and most of northern New Jersey, are missing, and 382 counties list fewer
    balancing authorities than 2024; 2023 -> 2024 changed 8), so 2024 is the latest complete year.
  - Census 2010 county boundaries (out_censusdp1tract__counties). EIA-861 still keys counties by
    2010-vintage FIPS (for example the eight Connecticut counties), so these boundaries line up with it.

Outputs (rewritten):
  data/raw/eia861_ba_county_<year>_<retrieved>.csv
      one row per (county, balancing authority) the latest EIA-861 year lists, with the BA's code and name
  data/raw/project_counties.csv
      one row per seed project: its county FIPS and how it was found
        spatial_join   the project's coordinates fall inside the county polygon
        record_county  no coordinates; the county named in the project's own record, matched by
                       name within its state (only when exactly one county has that name)
      plus the county the record or atlas states, and whether the two agree, and which EIA-861
      county rows apply (eia861_fips, eia861_match):
        fips          EIA-861 lists this county FIPS
        county_name   EIA-861 lists the county only under a bare name that PUDL assigned to the
                      same-named independent city ("Fairfax" -> Fairfax city, 51600, while Fairfax
                      County, 51059, never appears). The site's county then uses the rows EIA-861
                      publishes for that name. Only these name collisions qualify.

Nothing is guessed: a project whose point falls outside every county or in a county other than the
one its record names, or whose stated county name is ambiguous, gets no FIPS (the `note` column says why). `etl/assign_regions.py` turns these files into `sites.county_fips` and
`site_regions` at load time.

Usage: python etl/import_grid_regions.py [--refresh]   (--refresh re-downloads the PUDL files)
"""
from __future__ import annotations

import argparse
import csv
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import httpx
import pandas as pd
from shapely import STRtree, from_wkb
from shapely.geometry import Point

from common import STATE_FIPS

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CACHE = RAW / "cache"
SEED_DIRS = [ROOT / "data" / "seed", ROOT / "data" / "seed_national"]
PUDL = "https://s3.us-west-2.amazonaws.com/pudl.catalyst.coop/nightly"
FILES = {
    "territory": "out_eia861__yearly_balancing_authority_service_territory.parquet",
    "ba_names": "core_eia861__yearly_balancing_authority.parquet",
    "counties": "out_censusdp1tract__counties.parquet",
}
PROJECT_COUNTIES = RAW / "project_counties.csv"
REPORT_YEAR = 2024  # latest complete EIA-861 year in PUDL (see the module docstring)


_COUNTY_WORDS = re.compile(r"\s+(county|parish|borough|census area|municipio|municipality)$")


def county_key(name: str | None) -> str:
    """'Loudoun County' / 'Loudoun' -> 'loudoun'; 'Baltimore city' stays distinct from 'Baltimore'."""
    s = (name or "").strip().lower().replace(".", "").replace("saint ", "st ")
    return re.sub(r"\s+", " ", _COUNTY_WORDS.sub("", s))


def base_key(name: str | None) -> str:
    """County key with an independent city's trailing 'city' dropped: 'St. Louis City' -> 'st louis'."""
    return re.sub(r" city$", "", county_key(name))


def fetch(refresh: bool) -> dict[str, Path]:
    CACHE.mkdir(parents=True, exist_ok=True)
    paths = {}
    for key, name in FILES.items():
        path = CACHE / name
        if refresh or not path.exists():
            print(f"  downloading {name}")
            with httpx.stream("GET", f"{PUDL}/{name}", timeout=300, follow_redirects=True) as r:
                r.raise_for_status()
                with path.open("wb") as f:
                    for chunk in r.iter_bytes():
                        f.write(chunk)
        paths[key] = path
    return paths


def write_csv(path: Path, header: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def territory_rows(paths: dict[str, Path], year: int) -> list[dict]:
    terr = pd.read_parquet(paths["territory"])
    terr["year"] = pd.to_datetime(terr["report_date"]).dt.year
    by_year = terr.groupby("year")["county_id_fips"].nunique()
    print("EIA-861 counties per report year: " + ", ".join(f"{y} {n}" for y, n in by_year.tail(4).items()))
    terr = terr[terr["year"] == year]
    names = pd.read_parquet(paths["ba_names"])
    names = names[pd.to_datetime(names["report_date"]).dt.year == year].set_index("balancing_authority_id_eia")
    rows = {}
    for r in terr.itertuples():
        ba = int(r.balancing_authority_id_eia)
        code = names["balancing_authority_code_eia"].get(ba)
        name = names["balancing_authority_name_eia"].get(ba)
        key = (r.county_id_fips, ba)
        rows[key] = {"county_fips": r.county_id_fips, "state": r.state, "eia861_county": r.county,
                     "census_county": r.county_name_census,
                     "ba_id_eia": ba, "ba_code": code if isinstance(code, str) and code else "",
                     "ba_name": name if isinstance(name, str) else ""}
    return sorted(rows.values(), key=lambda x: (x["county_fips"], x["ba_id_eia"]))


def seed_projects() -> list[dict]:
    out = []
    for d in SEED_DIRS:
        path = d / "projects.csv"
        if not path.exists():
            continue
        with path.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if "<<FILL" in r.get("name", ""):
                    continue
                out.append({**r, "state": (r.get("state") or "TX").upper()})
    return out


def main(refresh: bool) -> None:
    paths = fetch(refresh)
    year = REPORT_YEAR
    terr = territory_rows(paths, year)
    retrieved = date.today().isoformat()
    ba_file = RAW / f"eia861_ba_county_{year}_{retrieved}.csv"
    for old in RAW.glob("eia861_ba_county_*.csv"):
        old.unlink()
    write_csv(ba_file, ["county_fips", "state", "eia861_county", "census_county", "ba_id_eia", "ba_code", "ba_name"], terr)
    listed = {t["county_fips"] for t in terr}
    # Bare EIA names ("Fairfax") by state, for counties whose own FIPS EIA-861 never lists.
    eia_names: dict[tuple[str, str], set[str]] = defaultdict(set)
    for t in terr:
        eia_names[(t["county_fips"][:2], base_key(t["eia861_county"]))].add(t["county_fips"])

    counties = pd.read_parquet(paths["counties"], columns=["county_id_fips", "county", "geometry"])
    geoms = [from_wkb(g) for g in counties["geometry"]]
    tree = STRtree(geoms)
    fips = counties["county_id_fips"].tolist()
    cname = counties["county"].tolist()
    by_name: dict[tuple[str, str], list[int]] = defaultdict(list)
    by_base: dict[tuple[str, str], list[int]] = defaultdict(list)  # "Fairfax County" and "Fairfax city" together
    for i, f in enumerate(fips):
        by_name[(f[:2], county_key(cname[i]))].append(i)
        by_base[(f[:2], base_key(cname[i]))].append(i)

    rows, stats = [], Counter()
    for p in seed_projects():
        st_fips = STATE_FIPS.get(p["state"])
        row = {"project_name": p["name"], "state": p["state"], "lat": p.get("lat", ""), "lon": p.get("lon", ""),
               "stated_county": p.get("county", ""), "county_fips": "", "census_county": "", "method": "",
               "stated_county_agrees": "", "eia861_fips": "", "eia861_match": "", "note": ""}
        if p.get("lat") and p.get("lon"):
            pt = Point(float(p["lon"]), float(p["lat"]))
            hits = [int(i) for i in tree.query(pt, predicate="intersects")]
            if len(hits) == 1 or (hits and len({fips[i] for i in hits}) == 1):
                i = hits[0]
                row.update(county_fips=fips[i], census_county=cname[i], method="spatial_join")
                if st_fips and fips[i][:2] != st_fips:
                    row.update(county_fips="", census_county="", method="",
                               note=f"point falls in {cname[i]} ({fips[i]}), outside {p['state']}; not tagged")
            elif hits:
                row["note"] = "point on a county boundary; not tagged"
            else:
                row["note"] = "point outside every county polygon; not tagged"
        elif p.get("county") and st_fips:
            match = by_name.get((st_fips, county_key(p["county"])), [])
            if len(match) == 1:
                i = match[0]
                row.update(county_fips=fips[i], census_county=cname[i], method="record_county")
            else:
                row["note"] = "stated county not found in its state" if not match else "stated county name is ambiguous"
        else:
            row["note"] = "no coordinates and no county in the record"
        if row["county_fips"] in listed:
            row.update(eia861_fips=row["county_fips"], eia861_match="fips")
        elif row["county_fips"]:
            key = (row["county_fips"][:2], base_key(row["census_county"]))
            same_name = by_base.get(key, [])
            other = eia_names.get(key, set()) - {row["county_fips"]}
            # Only the county/independent-city collisions: two Census areas share the name, and the
            # EIA-861 rows for that name were assigned to the other one.
            if len(same_name) == 2 and len(other) == 1:
                row.update(eia861_fips=other.pop(), eia861_match="county_name")
        if row["county_fips"] and row["stated_county"]:
            if row["stated_county"].endswith("Planning Region"):
                # Connecticut replaced counties with planning regions in 2022; EIA-861 still uses counties.
                row["stated_county_agrees"] = "not_comparable"
            elif county_key(row["stated_county"]) == county_key(row["census_county"]):
                row["stated_county_agrees"] = "yes"
            else:
                # The point and the record name different counties: hold it for review, tag nothing.
                row.update(stated_county_agrees="no", note=f"point is in {row['census_county']}, record says "
                           f"{row['stated_county']}; held for review, not tagged")
                row.update(county_fips="", eia861_fips="", eia861_match="")
        stats[row["method"] if row["county_fips"] else "untagged"] += 1
        if row["stated_county_agrees"] == "no":
            stats["stated_county_disagrees"] += 1
        rows.append(row)

    rows.sort(key=lambda r: (r["state"], r["project_name"]))
    write_csv(PROJECT_COUNTIES, list(rows[0].keys()), rows)

    served = defaultdict(set)
    for t in terr:
        served[t["county_fips"]].add(t["ba_id_eia"])
    tagged = [r for r in rows if r["county_fips"]]
    n_bas = Counter(min(len(served.get(r["eia861_fips"], ())), 2) for r in tagged)
    by_name_match = Counter(r["census_county"] for r in rows if r["eia861_match"] == "county_name")
    print(f"EIA-861 {year}: {len(terr)} county-BA rows, {len(served)} counties, "
          f"{len({t['ba_id_eia'] for t in terr})} balancing authorities -> {ba_file.relative_to(ROOT)}")
    print(f"projects: {len(rows)}; " + ", ".join(f"{k} {v}" for k, v in sorted(stats.items())))
    print(f"tagged projects in counties with one BA: {n_bas[1]}, several BAs: {n_bas[2]}, no EIA-861 BA: {n_bas[0]}")
    print("matched by EIA-861 county name: " + (", ".join(f"{k} {v}" for k, v in by_name_match.items()) or "none"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="re-download the PUDL files into data/raw/cache/")
    main(ap.parse_args().refresh)
