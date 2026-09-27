"""Convert the IM3 Open Source Data Center Atlas snapshot into data/seed_national rows.

Source: PNNL IM3 Open Source Data Center Atlas (derived from OpenStreetMap, ODbL), the
`im3_datacenter_centroids.geojson` layer published on the atlas site (GitHub
IMMM-SFA/datacenter-atlas, gh-pages). One feature is one mapped data-center building,
campus or point, with its state, county, OSM operator tag, name and footprint area.

Rules (nothing is inferred beyond what the atlas records):
  project  = one per feature, named "<name> · <County>, <ST>" (name falls back to
             "<operator> data center", then "Unnamed data center"; duplicates get " #n")
  entity   = "<operator> (OSM operator)": the OSM operator tag as written, resolved_by OSM_OPERATOR.
             The suffix keeps it apart from Texas registered entities with the same text.
  parent   = the operator, with spelling variants of the same company merged (OPERATOR_ALIASES)
  event    = one `site_mapped` OSM event per feature, dated at the atlas snapshot, with the
             footprint area (sq ft) as value_num. It carries 0 scoring points.
Texas already has primary-record projects, and the atlas has no addresses to prove a match, so a
Texas feature is held back (not loaded) when it may be one of them:
  - it lies within 250 m of an existing Texas project, or
  - its operator's parent already has a Texas project in the same county, or one with no county.
Every Texas feature is listed in data/raw/im3_texas_review.csv with its nearest existing project and
whether it was loaded or held.

Output: data/seed_national/{parents,entities,projects,evidence_events}.csv (rewritten).

Usage: python etl/import_im3_atlas.py [--file data/raw/im3_datacenter_atlas_2026-03-31.geojson]
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

from import_comptroller import KNOWN_COMPANIES, OTHER_PARENT_COLOR

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "seed_national"
TEXAS_SEED = ROOT / "data" / "seed"
DEFAULT_FILE = RAW / "im3_datacenter_atlas_2026-03-31.geojson"
REVIEW = RAW / "im3_texas_review.csv"

# Snapshot provenance: the atlas site's gh-pages commit that published this file.
ATLAS_COMMIT = "48d45f6eef72778edf374ec52c379550bb21a046"
ATLAS_DATE = "2026-03-31"
ATLAS_URL = f"https://github.com/IMMM-SFA/datacenter-atlas/blob/{ATLAS_COMMIT}/im3_datacenter_centroids.geojson"
DATASET_URL = "https://data.msdlive.org/records/65g71-a4731"

# Same company, different spelling in the OSM operator tag. Only exact identities are merged;
# a subsidiary is folded into its parent only when the tag itself names the parent brand.
OPERATOR_ALIASES = {
    "Amazon Web Services": "Amazon",
    "Amazon IAD75": "Amazon", "Amazon IAD85": "Amazon", "Amazon IAD95": "Amazon", "Amazon IAD96": "Amazon",
    "Apple Inc.": "Apple",
    "Aligned Data Centers": "Aligned",
    "American Telephone & Telegraph": "AT&T",
    "Centurylink": "CenturyLink",
    "CoreSite Real Estate 1656 McCarthy, L.P.": "CoreSite",
    "Csquare": "Centersquare",
    "Databank": "DataBank",
    "H5 Data Centers": "H5",
    "NTT Limited": "NTT",
    "QTS Data Centers": "Quality Technology Services",
    "Sabey Data Centers": "Sabey",
    "Serverfarm LLC.": "Serverfarm",
    "Stack Infrastructure, Incorporated": "Stack Infrastructure",
    "Vantage Data Centers": "Vantage",
    "Verizon Wireless": "Verizon",
}
# OSM operator values that are a private person's name are withheld, as in the Texas import.
WITHHELD_OPERATORS = {"Dennis Sampier"}

COUNTY_SUFFIX = re.compile(r"\s+(County|Parish|Borough|Census Area|Municipio)$")


def county_name(raw: str | None) -> str:
    """'Loudoun County' -> 'Loudoun' (Texas rows store the bare name). Independent cities
    ('Baltimore city') and Connecticut planning regions keep their full name."""
    raw = (raw or "").strip()
    if raw.endswith(" city") or raw.endswith(" Region"):
        return raw
    return COUNTY_SUFFIX.sub("", raw)


def parent_for(operator: str) -> str:
    return OPERATOR_ALIASES.get(operator, operator)


def color_for(parent: str) -> str:
    return next((c for _, p, c in KNOWN_COMPANIES if p == parent), OTHER_PARENT_COLOR)


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def write_csv(path: Path, header: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def texas_review(features: list[dict]) -> list[dict]:
    """Write the Texas review file and return the Texas features that are safe to load."""
    with (TEXAS_SEED / "projects.csv").open(newline="", encoding="utf-8") as f:
        texas = list(csv.DictReader(f))
    with (TEXAS_SEED / "entities.csv").open(newline="", encoding="utf-8") as f:
        parent_of = {r["llc_name"]: r["parent_name"] for r in csv.DictReader(f)}
    known = [(r["name"], float(r["lat"]), float(r["lon"])) for r in texas if r["lat"] and r["lon"]]
    parent_counties: dict[str, set[str]] = defaultdict(set)
    for r in texas:
        if parent_of.get(r["llc_name"]):
            parent_counties[parent_of[r["llc_name"]]].add(r["county"])
    rows, keep = [], []
    for ft in features:
        p, (lon, lat) = ft["properties"], ft["geometry"]["coordinates"]
        op = "" if p.get("operator") in WITHHELD_OPERATORS else (p.get("operator") or "")
        county = county_name(p.get("county"))
        near = min(known, key=lambda k: haversine_m((lat, lon), (k[1], k[2])))
        dist = haversine_m((lat, lon), (near[1], near[2]))
        counties = parent_counties.get(parent_for(op), set()) if op else set()
        if dist <= 250:
            status = "held_within_250m"
        elif county in counties or "" in counties:
            status = "held_same_parent_in_county"
        else:
            status = "loaded"
            keep.append(ft)
        rows.append({"atlas_name": p.get("name") or "", "operator": op, "county": county,
                     "lat": round(lat, 6), "lon": round(lon, 6),
                     "footprint_sqft": round(p["sqft"]) if p.get("sqft") else "", "atlas_type": p.get("type") or "",
                     "nearest_texas_project": near[0], "distance_m": round(dist), "review_status": status})
    rows.sort(key=lambda r: (r["review_status"], r["distance_m"]))
    write_csv(REVIEW, list(rows[0].keys()), rows)
    return keep


def main(file: Path) -> None:
    data = json.loads(file.read_text())
    features = data["features"]
    tx = [f for f in features if f["properties"].get("state_abb") == "TX"]
    tx_loaded = texas_review(tx)
    national = [f for f in features if f["properties"].get("state_abb") != "TX"] + tx_loaded

    with (TEXAS_SEED / "entities.csv").open(newline="", encoding="utf-8") as f:
        texas_entities = {r["llc_name"] for r in csv.DictReader(f)}

    # Deterministic order so " #n" suffixes are stable between runs.
    national.sort(key=lambda f: (f["properties"]["state_abb"], f["properties"].get("county") or "",
                                 f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0]))
    base_names = []
    for f in national:
        p = f["properties"]
        op = None if p.get("operator") in WITHHELD_OPERATORS else p.get("operator")
        base = (p.get("name") or "").strip() or (f"{op} data center" if op else "Unnamed data center")
        base_names.append(f"{base} · {county_name(p.get('county'))}, {p['state_abb']}")
    totals = Counter(base_names)
    seen: Counter = Counter()

    projects, events, entities, parents = [], [], {}, {}
    for f, base in zip(national, base_names):
        p = f["properties"]
        lon, lat = f["geometry"]["coordinates"]
        seen[base] += 1
        name = f"{base} #{seen[base]}" if totals[base] > 1 else base
        op = None if p.get("operator") in WITHHELD_OPERATORS else (p.get("operator") or None)
        entity = f"{op} (OSM operator)" if op else ""
        if op:
            if entity in texas_entities:
                raise SystemExit(f"entity {entity!r} collides with a Texas registered entity")
            parent = parent_for(op)
            parents[parent] = color_for(parent)
            entities[entity] = {"llc_name": entity, "parent_name": parent, "resolved_by": "OSM_OPERATOR", "source_url": ATLAS_URL}
        projects.append({"name": name, "state": p["state_abb"], "county": county_name(p.get("county")),
                         "city": "", "address": "", "lat": round(lat, 6), "lon": round(lon, 6), "llc_name": entity})
        sqft = p.get("sqft")
        payload = {"dataset": "IM3 Open Source Data Center Atlas", "dataset_url": DATASET_URL,
                   "atlas_commit": ATLAS_COMMIT, "atlas_type": p.get("type"), "osm_name": p.get("name"),
                   "operator": op, "footprint_sqft": round(sqft) if sqft else None, "license": "ODbL-1.0"}
        events.append({"ts": ATLAS_DATE, "project_name": name, "source": "OSM", "event_type": "site_mapped",
                       "value_num": round(sqft) if sqft else "", "payload_json": json.dumps(payload),
                       "source_url": ATLAS_URL})

    OUT.mkdir(parents=True, exist_ok=True)
    write_csv(OUT / "parents.csv", ["name", "color_hex"], [{"name": k, "color_hex": v} for k, v in sorted(parents.items())])
    write_csv(OUT / "entities.csv", ["llc_name", "parent_name", "resolved_by", "source_url"], sorted(entities.values(), key=lambda e: e["llc_name"]))
    write_csv(OUT / "projects.csv", ["name", "state", "county", "city", "address", "lat", "lon", "llc_name"], projects)
    write_csv(OUT / "evidence_events.csv", ["ts", "project_name", "source", "event_type", "value_num", "payload_json", "source_url"], events)

    by_state = Counter(p["state"] for p in projects)
    print(f"{len(projects)} data centers in {len(by_state)} states/territories; "
          f"{len(entities)} operator tags -> {len(parents)} parents; {sum(1 for p in projects if not p['llc_name'])} without operator")
    print(f"Texas: {len(tx_loaded)} of {len(tx)} atlas features loaded; {len(tx) - len(tx_loaded)} held as possible "
          f"duplicates of existing Texas projects (see {REVIEW.relative_to(ROOT)})")
    print("top states:", ", ".join(f"{s} {n}" for s, n in by_state.most_common(10)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", type=Path, default=DEFAULT_FILE)
    main(ap.parse_args().file)
