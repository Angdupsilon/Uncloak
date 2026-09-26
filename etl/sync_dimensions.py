"""Build the auditable dimensions that sit above public-record projects.

This deliberately does not invent matches. Projects sharing a normalized street address
are grouped into one physical site; every other project gets its own site. Reviewed location
crosswalk metadata, TDLR lifecycle observations, current ownership resolutions, optional
capacity observations and optional ERCOT links are then loaded with their provenance.
"""
from __future__ import annotations

import csv
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

import pandas as pd

import config
from common import clean, connect, normalize_address, normalize_name, to_float

RAW = config.ROOT / "data" / "raw"

SOURCE_FILES = {
    "COMPTROLLER": ("comptroller_data_centers_*.csv", "https://comptroller.texas.gov/taxes/data-centers/data-center-lists.php"),
    "TDLR": ("tdlr_data_centers_*.csv", "https://www.tdlr.texas.gov/TABS/Search"),
    "ERCOT": ("ercot_large_load_queue.csv", "https://www.ercot.com/gridinfo/resource"),
}


def dated_file(pattern: str) -> Path | None:
    files = sorted(RAW.glob(pattern))
    return files[-1] if files else None


def snapshot_date(path: Path) -> date:
    match = re.search(r"(20\d{2}-\d{2}-\d{2})", path.name)
    return date.fromisoformat(match.group(1)) if match else date.fromtimestamp(path.stat().st_mtime)


def location_crosswalk() -> dict[str, dict[str, str]]:
    path = RAW / "project_locations.csv"
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        return {r["project_name"].strip(): r for r in csv.DictReader(handle)
                if r.get("status", "").strip().lower() in {"verified", "corroborated"}}


def status_name(raw: str) -> str:
    s = normalize_name(raw)
    return {
        "project registered": "registered",
        "review complete": "design_review_complete",
        "inspection requested": "inspection_pending",
        "inspection complete": "inspection_complete",
        "project closed": "closed",
    }.get(s, "other")


def site_group(project: dict) -> str:
    address = normalize_address(project.get("address"))
    city = normalize_name(project.get("city"))
    # A complete street address is strong enough to identify a campus, but road-only and
    # intersection descriptions remain separate until a reviewed crosswalk links them.
    if address and city and re.match(r"^\d+\b", address):
        return f"address:{address}|{city}"
    return f"project:{project['project_id']}"


def load_optional_capacity(cur, directory: Path, project_ids: dict[str, int]) -> int:
    path = directory / "capacity_observations.csv"
    if not path.exists():
        return 0
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    cur.execute("DELETE FROM capacity_observations WHERE notes LIKE '[seed]%%'")
    n = 0
    for i, row in df.iterrows():
        name = clean(row.get("project_name")); mw = to_float(row.get("mw"))
        if not name or name not in project_ids or not mw:
            print(f"  WARN capacity_observations.csv row {i + 2}: unknown project or missing MW; skipped")
            continue
        kind = clean(row.get("capacity_type"))
        if kind not in {"actual", "announced", "interconnection", "modeled"}:
            raise SystemExit(f"capacity_observations.csv row {i + 2}: invalid capacity_type {kind!r}")
        cur.execute("""INSERT INTO capacity_observations
          (project_id, observed_at, mw, capacity_type, source_url, notes)
          VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
          (project_ids[name], clean(row.get("observed_at")), mw, kind,
           clean(row.get("source_url")), "[seed] " + (clean(row.get("notes")) or "")))
        n += 1
    return n


def load_optional_ercot_links(cur, directory: Path, project_ids: dict[str, int]) -> int:
    path = directory / "ercot_project_links.csv"
    if not path.exists():
        return 0
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    n = 0
    for i, row in df.iterrows():
        name = clean(row.get("project_name"))
        if not name or name not in project_ids:
            print(f"  WARN ercot_project_links.csv row {i + 2}: unknown project; skipped")
            continue
        cur.execute("""INSERT INTO ercot_project_links
          (project_id, ercot_project_id, observed_at, status, requested_mw, approved_mw,
           energized_mw, confidence, source_url) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
          ON CONFLICT (project_id, ercot_project_id, observed_at) DO UPDATE SET
            status=EXCLUDED.status, requested_mw=EXCLUDED.requested_mw,
            approved_mw=EXCLUDED.approved_mw, energized_mw=EXCLUDED.energized_mw,
            confidence=EXCLUDED.confidence, source_url=EXCLUDED.source_url""",
          (project_ids[name], clean(row.get("ercot_project_id")), clean(row.get("observed_at")),
           clean(row.get("status")), to_float(row.get("requested_mw")),
           to_float(row.get("approved_mw")), to_float(row.get("energized_mw")),
           to_float(row.get("confidence")), clean(row.get("source_url"))))
        n += 1
    return n


def main(directory: Path) -> None:
    crosswalk = location_crosswalk()
    today = date.today()
    with connect() as conn, conn.cursor() as cur:
        cur.execute("""SELECT p.project_id,p.name,p.county,p.city,p.address,p.lat,p.lon,p.entity_id,
                              e.parent_id,e.resolved_by,e.source_url
                       FROM projects p LEFT JOIN entities e USING(entity_id) ORDER BY p.project_id""")
        projects = [dict(zip(("project_id","name","county","city","address","lat","lon","entity_id",
                             "parent_id","resolved_by","entity_source_url"), row)) for row in cur.fetchall()]
        project_ids = {p["name"]: p["project_id"] for p in projects}

        groups: dict[str, list[dict]] = defaultdict(list)
        for project in projects:
            groups[site_group(project)].append(project)
        cur.execute("DELETE FROM project_sites")
        cur.execute("DELETE FROM sites")
        for key, members in groups.items():
            located = [p for p in members if p["lat"] is not None and p["lon"] is not None]
            anchor = located[0] if located else members[0]
            reviewed = [crosswalk[p["name"]] for p in members if p["name"] in crosswalk]
            loc = reviewed[0] if reviewed else None
            if loc:
                method = "primary_record" if loc["status"].lower() == "verified" else "secondary_compilation"
                precision = "campus" if "offset" in loc.get("basis", "").lower() or len(members) > 1 else "address"
                confidence = 1.0 if loc["status"].lower() == "verified" else 0.8
                source_url, basis = loc["source_url"], loc["basis"]
            elif located:
                cur.execute("""SELECT source_url FROM evidence_events WHERE project_id=%s AND source='TDLR'
                               AND source_url IS NOT NULL ORDER BY ts DESC LIMIT 1""", (anchor["project_id"],))
                row = cur.fetchone()
                method, precision, confidence = "geocoded_primary_address", "address", 0.85
                source_url, basis = (row[0] if row else None), "Coordinates from a public-record address"
            else:
                method = precision = source_url = basis = None; confidence = None
            name = members[0]["name"] if len(members) == 1 else re.sub(r"\s+(?:I{1,3}|IV|V|VI{0,3}|IX|X)$", "", members[0]["name"])
            cur.execute("""INSERT INTO sites (site_key,name,county,city,address,lat,lon,location_source_url,
                         location_method,location_precision,location_confidence,location_basis,reviewed_at)
                         VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING site_id""",
                        (key, name, anchor["county"], anchor["city"], anchor["address"], anchor["lat"], anchor["lon"],
                         source_url, method, precision, confidence, basis, today if loc else None))
            site_id = cur.fetchone()[0]
            for p in members:
                rel = "same_address" if len(members) > 1 else "registration"
                cur.execute("INSERT INTO project_sites (project_id,site_id,relationship) VALUES (%s,%s,%s)",
                            (p["project_id"], site_id, rel))

        cur.execute("DELETE FROM project_status_history")
        cur.execute("""SELECT project_id, (payload->>'retrieved')::date, payload->>'status', source_url
                       FROM evidence_events WHERE source='TDLR' AND event_type='building_registered'
                         AND payload ? 'status' AND payload ? 'retrieved'""")
        statuses: dict[tuple[int, date, str, str], tuple] = {}
        for pid, observed, raw, url in cur.fetchall():
            if raw:
                status = status_name(raw)
                statuses[(pid, observed, "TDLR", status)] = (pid, observed, status, raw, "TDLR", url)
        for row in statuses.values():
            cur.execute("""INSERT INTO project_status_history
              (project_id,observed_at,status,raw_status,source,source_url) VALUES (%s,%s,%s,%s,%s,%s)""", row)

        cur.execute("DELETE FROM entity_parent_history")
        for p in projects:
            if p["entity_id"] and p["parent_id"]:
                cur.execute("""INSERT INTO entity_parent_history
                  (entity_id,observed_at,parent_id,resolved_by,source_url) VALUES (%s,%s,%s,%s,%s)
                  ON CONFLICT (entity_id,observed_at) DO UPDATE SET parent_id=EXCLUDED.parent_id,
                    resolved_by=EXCLUDED.resolved_by,source_url=EXCLUDED.source_url""",
                  (p["entity_id"], today, p["parent_id"], p["resolved_by"], p["entity_source_url"]))

        cur.execute("DELETE FROM source_refreshes")
        for source, (pattern, url) in SOURCE_FILES.items():
            path = dated_file(pattern)
            if path:
                with path.open(newline="", encoding="utf-8") as handle:
                    count = sum(1 for _ in csv.DictReader(handle))
                cur.execute("INSERT INTO source_refreshes VALUES (%s,%s,%s,%s,%s)",
                            (source, snapshot_date(path), count, url, str(path.relative_to(config.ROOT))))
        cur.execute("SELECT count(*), min(source_url) FROM evidence_events WHERE source='TCEQ'")
        tceq_count, tceq_url = cur.fetchone()
        if tceq_count:
            cur.execute("INSERT INTO source_refreshes VALUES (%s,%s,%s,%s,%s)",
                        ("TCEQ", today, tceq_count, tceq_url,
                         "data/seed/evidence_events.csv (reviewed primary documents)"))
        capacities = load_optional_capacity(cur, directory, project_ids)
        links = load_optional_ercot_links(cur, directory, project_ids)
    print(f"  dimensions: {len(groups)} canonical sites, {len(statuses)} lifecycle observations, "
          f"{capacities} sourced capacities, {links} ERCOT project links")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=Path, default=config.ROOT / "data" / "seed")
    main(parser.parse_args().dir)
