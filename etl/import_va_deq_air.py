"""Virginia DEQ data-center air permits -> `permit_filed` events (source VA_DEQ) on confirmed sites.

Inputs:
  data/raw/va_deq_air_permits_<retrieved>.csv   DEQ's "Issued Air Permits for Data Centers" list
      (facility, registration number, permit document link, issue date, program, city/county,
      regional office), transcribed from the page and checked against it (data/raw/README.md)
  data/raw/va_deq_permit_details.csv            optional: per-permit facts read from the permit
      document itself: permit_no, facility_address, lat, lon, generator_count, generator_mw_total,
      detail_source (document page), reviewed_by

Matching rule (nothing is merged on a guess). A permit is linked to an atlas site only when
  1. the permit's facility name contains the site's operator (the parent the atlas names), and
  2. the permit document places the facility within 250 m of that site (lat/lon in the details file),
     and exactly one such site qualifies.
The DEQ list itself has no address or coordinates, only a county, so without the details file no
permit can be confirmed. Every permit is written to data/raw/va_deq_review.csv with its status, the
reason, and the same-operator atlas sites in its county as candidates for review.

Output: data/seed_states/va_deq/evidence_events.csv (rewritten). Load it after the national layer:
  python etl/run_all.py --dir data/seed --dir data/seed_national --dir data/seed_states/va_deq

Usage: python etl/import_va_deq_air.py [--file data/raw/va_deq_air_permits_2026-09-26.csv]
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
NATIONAL = ROOT / "data" / "seed_national"
OUT = ROOT / "data" / "seed_states" / "va_deq"
DETAILS = RAW / "va_deq_permit_details.csv"
REVIEW = RAW / "va_deq_review.csv"
LIST_URL = "https://www.deq.virginia.gov/news-info/shortcuts/permits/air/issued-air-permits-for-data-centers"
MAX_M = 250

# Brand text in a DEQ facility name -> atlas parent. Only the brand written in the permit name counts:
# a subsidiary name that doesn't say the brand (e.g. "VADATA Inc") is not mapped.
BRAND_ALIASES = {
    "amazon": "Amazon", "microsoft": "Microsoft", "equinix": "Equinix", "digital realty": "Digital Realty",
    "qts": "Quality Technology Services", "cyrusone": "CyrusOne", "vantage": "Vantage", "ntt": "NTT",
    "coresite": "CoreSite", "aligned": "Aligned", "iron mountain": "Iron Mountain", "stack infrastructure": "Stack Infrastructure",
    "cologix": "Cologix", "h5": "H5", "compass": "Compass Datacenters", "yondr": "Yondr", "databank": "DataBank",
    "cloud hq": "CloudHQ", "verizon": "Verizon", "zayo": "Zayo", "level 3": "Level 3", "sabey": "Sabey", "google": "Google", "meta": "Meta",
}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", (s or "").lower())).strip()


def deq_county(raw: str) -> str:
    """'Loudoun Co.' -> 'Loudoun'; 'Manassas City' -> 'Manassas city' (the atlas's spelling)."""
    raw = raw.strip()
    if raw.endswith(" Co."):
        return raw[:-4].strip()
    if raw.endswith(" City"):
        return raw[:-5].strip() + " city"
    return raw


def brands_in(name: str, parents: set[str]) -> set[str]:
    n = f" {norm(name)} "
    found = {parent for alias, parent in BRAND_ALIASES.items() if f" {alias} " in n and parent in parents}
    return found


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def read(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, header: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def main(file: Path) -> None:
    permits = read(file)
    details = {r["permit_no"]: r for r in read(DETAILS)} if DETAILS.exists() else {}
    parent_of = {r["llc_name"]: r["parent_name"] for r in read(NATIONAL / "entities.csv")}
    sites = [dict(p, parent=parent_of.get(p["llc_name"], "")) for p in read(NATIONAL / "projects.csv") if p["state"] == "VA"]
    parents = {s["parent"] for s in sites if s["parent"]}
    by_county: dict[str, list[dict]] = defaultdict(list)
    for s in sites:
        by_county[s["county"]].append(s)

    events, review = [], []
    for p in permits:
        county = deq_county(p["city_county"])
        brands = brands_in(p["air_site_name"], parents)
        candidates = [s for s in by_county.get(county, []) if s["parent"] in brands]
        d = details.get(p["registration_no"], {})
        status, basis, match = "unmatched", "", None
        if "unverified" in p.get("note", ""):
            basis = "DEQ links the same document for two permits; the permit document can't be attributed"
        elif not brands:
            basis = "facility name names no operator that has a mapped Virginia site"
        elif not candidates:
            basis = f"no {'/'.join(sorted(brands))} site mapped in {county}"
        elif not (d.get("lat") and d.get("lon")):
            status, basis = "needs_permit_location", "permit document not yet read: the DEQ list gives only the county"
        else:
            pt = (float(d["lat"]), float(d["lon"]))
            near = sorted((haversine_m(pt, (float(s["lat"]), float(s["lon"]))), s["name"]) for s in candidates)
            within = [n for n in near if n[0] <= MAX_M]
            if len(within) == 1:
                status, match = "confirmed", within[0][1]
                basis = f"operator {'/'.join(sorted(brands))} in the permit name; permit location {within[0][0]:.0f} m from the mapped site"
            elif within:
                basis = f"{len(within)} same-operator sites within {MAX_M} m; which one the permit covers isn't stated"
            else:
                basis = f"nearest same-operator site is {near[0][0]:.0f} m from the permit location"
        review.append({"registration_no": p["registration_no"], "air_site_name": p["air_site_name"],
                       "issue_date": p["issue_date"], "county": county, "operators_named": "; ".join(sorted(brands)),
                       "status": status, "basis": basis, "matched_project": match or "",
                       "candidate_sites": " | ".join(s["name"] for s in candidates[:12]) + (" | ..." if len(candidates) > 12 else ""),
                       "n_candidates": len(candidates), "document_url": p["document_url"]})
        if match:
            mw = d.get("generator_mw_total") or ""
            payload = {"permit_id": p["registration_no"], "facility": p["air_site_name"], "county": county,
                       "program_type": p["program_type"], "regional_office": p["regional_office"],
                       "issue_date_published": p["issue_date_published"], "list_as_of": p["list_as_of"],
                       "list_url": LIST_URL, "facility_address": d.get("facility_address") or None,
                       "generator_count": int(d["generator_count"]) if d.get("generator_count") else None,
                       "generator_mw_total": float(mw) if mw else None, "detail_source": d.get("detail_source") or None,
                       "match_basis": basis}
            events.append({"ts": p["issue_date"], "project_name": match, "source": "VA_DEQ", "event_type": "permit_filed",
                           "value_num": mw, "payload_json": json.dumps(payload), "source_url": p["document_url"]})

    write_csv(OUT / "evidence_events.csv", ["ts", "project_name", "source", "event_type", "value_num", "payload_json", "source_url"], events)
    write_csv(REVIEW, list(review[0].keys()), review)
    counts = defaultdict(int)
    for r in review:
        counts[r["status"]] += 1
    print(f"{len(permits)} DEQ permits; details for {len(details)}; " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    print(f"-> {len(events)} permit_filed events in {(OUT / 'evidence_events.csv').relative_to(ROOT)}; review: {REVIEW.relative_to(ROOT)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", type=Path, default=sorted(RAW.glob("va_deq_air_permits_*.csv"))[-1])
    main(ap.parse_args().file)
