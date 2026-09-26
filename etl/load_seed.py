"""Load data/seed/*.csv (or data/sample/*.csv) into the database.

Order: parents -> entities -> projects -> evidence_events -> ercot_queue.
Names are resolved to IDs. Unknown event_type/source values fail loudly.
Cells containing <<FILL>> are treated as missing; rows missing a required
field are skipped with a warning so a partially filled seed still loads.

Usage: python etl/load_seed.py --dir data/seed|data/sample [--reset]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd
from psycopg.types.json import Jsonb

import config
from common import clean, connect, is_fill, parse_payload, to_float

ORIGIN = "seed_csv"  # payload marker so reloading replaces only rows this script inserted


def read_csv(directory: Path, name: str) -> pd.DataFrame:
    path = directory / name
    if not path.exists():
        print(f"  (no {name}, skipping)")
        return pd.DataFrame()
    return pd.read_csv(path, dtype=str, keep_default_na=False, comment=None)


def warn(msg: str) -> None:
    print(f"  WARN {msg}")


def is_sample_dir(directory: Path) -> bool:
    return directory.resolve().name == "sample"


def reset_all(cur) -> None:
    print("Resetting all GridSight tables")
    cur.execute("TRUNCATE project_scores, evidence_events, ercot_queue")
    cur.execute("TRUNCATE projects, entities, parents RESTART IDENTITY CASCADE")


def purge_sample(cur) -> None:
    cur.execute("SELECT project_id FROM projects WHERE is_sample")
    ids = [r[0] for r in cur.fetchall()]
    if ids:
        cur.execute("DELETE FROM project_scores WHERE project_id = ANY(%s)", (ids,))
        cur.execute("DELETE FROM evidence_events WHERE project_id = ANY(%s)", (ids,))
        cur.execute("DELETE FROM projects WHERE project_id = ANY(%s)", (ids,))
    cur.execute("DELETE FROM entities e WHERE llc_name LIKE 'SAMPLE %%' "
                "AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.entity_id = e.entity_id)")
    cur.execute("DELETE FROM parents pa WHERE name LIKE 'SAMPLE %%' "
                "AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.parent_id = pa.parent_id)")
    cur.execute("DELETE FROM ercot_queue WHERE source_url = 'SAMPLE'")
    if ids:
        print(f"  purged {len(ids)} SAMPLE projects (loading non-sample data)")


def load_parents(cur, df: pd.DataFrame) -> int:
    n = 0
    for i, row in df.iterrows():
        name = clean(row.get("name"))
        if not name:
            warn(f"parents.csv row {i + 2}: missing name, skipped")
            continue
        cur.execute(
            """INSERT INTO parents (name, color_hex) VALUES (%s, %s)
               ON CONFLICT (name) DO UPDATE SET color_hex = EXCLUDED.color_hex""",
            (name, clean(row.get("color_hex"))),
        )
        n += 1
    return n


def load_entities(cur, df: pd.DataFrame) -> int:
    n = 0
    for i, row in df.iterrows():
        llc = clean(row.get("llc_name"))
        if not llc:
            warn(f"entities.csv row {i + 2}: missing llc_name, skipped")
            continue
        parent_name = clean(row.get("parent_name"))
        parent_id = None
        if parent_name:
            cur.execute("SELECT parent_id FROM parents WHERE name = %s", (parent_name,))
            r = cur.fetchone()
            if not r:
                raise SystemExit(f"entities.csv row {i + 2}: unknown parent_name {parent_name!r} (add it to parents.csv)")
            parent_id = r[0]
        resolved_by = clean(row.get("resolved_by"))
        if resolved_by and resolved_by not in config.RESOLVED_BY:
            raise SystemExit(f"entities.csv row {i + 2}: resolved_by must be one of {sorted(config.RESOLVED_BY)}, got {resolved_by!r}")
        cur.execute(
            """INSERT INTO entities (llc_name, parent_id, resolved_by, source_url) VALUES (%s, %s, %s, %s)
               ON CONFLICT (llc_name) DO UPDATE
               SET parent_id = EXCLUDED.parent_id, resolved_by = EXCLUDED.resolved_by, source_url = EXCLUDED.source_url""",
            (llc, parent_id, resolved_by, clean(row.get("source_url"))),
        )
        n += 1
    return n


def load_projects(cur, df: pd.DataFrame, sample: bool) -> tuple[int, set[str]]:
    n = 0
    skipped: set[str] = set()
    for i, row in df.iterrows():
        name = clean(row.get("name"))
        if not name:
            warn(f"projects.csv row {i + 2}: name missing or <<FILL>>, skipped")
            if isinstance(row.get("name"), str):
                skipped.add(row.get("name").strip())
            continue
        llc = clean(row.get("llc_name"))
        entity_id = None
        if llc:
            cur.execute("SELECT entity_id FROM entities WHERE llc_name = %s", (llc,))
            r = cur.fetchone()
            if not r:
                raise SystemExit(f"projects.csv row {i + 2}: unknown llc_name {llc!r} (add it to entities.csv)")
            entity_id = r[0]
        filled = [c for c in ("county", "city", "address", "lat", "lon", "llc_name") if is_fill(row.get(c))]
        if filled:
            warn(f"projects.csv {name!r}: {', '.join(filled)} still <<FILL>> (loaded as null)")
        cur.execute(
            """INSERT INTO projects (name, county, city, address, lat, lon, entity_id, is_sample)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (name) DO UPDATE SET county = EXCLUDED.county, city = EXCLUDED.city,
                 address = EXCLUDED.address,
                 lat = COALESCE(EXCLUDED.lat, projects.lat), lon = COALESCE(EXCLUDED.lon, projects.lon),
                 entity_id = EXCLUDED.entity_id, is_sample = EXCLUDED.is_sample""",
            (name, clean(row.get("county")), clean(row.get("city")), clean(row.get("address")),
             to_float(row.get("lat")), to_float(row.get("lon")), entity_id,
             sample or name.upper().startswith("SAMPLE")),
        )
        n += 1
    return n, skipped


def load_events(cur, df: pd.DataFrame, skipped_projects: set[str]) -> int:
    if df.empty:
        return 0
    # Validate every row before touching the table.
    bad = df[~df["event_type"].str.strip().isin(config.EVENT_TYPES)]
    if not bad.empty:
        rows = ", ".join(f"row {i + 2}={v!r}" for i, v in bad["event_type"].items())
        raise SystemExit(f"evidence_events.csv: unknown event_type ({rows}). Allowed: {sorted(config.EVENT_TYPES)}")
    bad = df[~df["source"].str.strip().isin(config.SOURCES)]
    if not bad.empty:
        rows = ", ".join(f"row {i + 2}={v!r}" for i, v in bad["source"].items())
        raise SystemExit(f"evidence_events.csv: unknown source ({rows}). Allowed: {sorted(config.SOURCES)}")

    cur.execute("SELECT name, project_id FROM projects")
    ids = dict(cur.fetchall())
    rows, touched = [], set()
    for i, row in df.iterrows():
        pname = row["project_name"].strip()
        where = f"evidence_events.csv row {i + 2} ({pname})"
        if is_fill(pname) or pname in skipped_projects:
            warn(f"{where}: project not loaded, skipped")
            continue
        if pname not in ids:
            raise SystemExit(f"{where}: unknown project_name (add it to projects.csv)")
        ts_raw = clean(row.get("ts"))
        if not ts_raw:
            warn(f"{where}: ts missing or <<FILL>>, skipped")
            continue
        etype, source = row["event_type"].strip(), row["source"].strip()
        if config.EVENT_TYPES[etype] != source:
            warn(f"{where}: event_type {etype} usually comes from {config.EVENT_TYPES[etype]}, got {source}")
        if is_fill(row.get("value_num")):
            warn(f"{where}: value_num is <<FILL>>, skipped")
            continue
        try:
            payload = parse_payload(row.get("payload_json"))
        except (json.JSONDecodeError, ValueError) as e:
            raise SystemExit(f"{where}: bad payload_json: {e}")
        payload["_origin"] = ORIGIN
        ts = pd.Timestamp(ts_raw)
        ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
        rows.append((ts.to_pydatetime(), ids[pname], source, etype, to_float(row.get("value_num")),
                     Jsonb(payload), clean(row.get("source_url"))))
        touched.add(ids[pname])

    # Idempotent: replace previously seeded events for every project in this file.
    all_projects = [ids[p.strip()] for p in df["project_name"] if p.strip() in ids]
    if all_projects:
        cur.execute("DELETE FROM evidence_events WHERE project_id = ANY(%s) AND payload->>'_origin' = %s",
                    (list(set(all_projects)), ORIGIN))
    with cur.copy("COPY evidence_events (ts, project_id, source, event_type, value_num, payload, source_url) FROM STDIN") as cp:
        for r in rows:
            cp.write_row(r)
    return len(rows)


def load_ercot(cur, df: pd.DataFrame) -> int:
    n = 0
    for i, row in df.iterrows():
        ts_raw = clean(row.get("ts"))
        if not ts_raw:
            warn(f"ercot_queue.csv row {i + 2}: ts missing or <<FILL>>, skipped")
            continue
        vals = {c: row.get(c) for c in ("gw_requested", "gw_approved", "gw_observed_peak")}
        if any(is_fill(v) for v in vals.values()):
            warn(f"ercot_queue.csv row {i + 2}: contains <<FILL>> values, skipped")
            continue
        ts = pd.Timestamp(ts_raw)
        ts = (ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")).to_pydatetime()
        cur.execute("DELETE FROM ercot_queue WHERE ts = %s", (ts,))
        cur.execute(
            "INSERT INTO ercot_queue (ts, gw_requested, gw_approved, gw_observed_peak, source_url) VALUES (%s, %s, %s, %s, %s)",
            (ts, *(to_float(v) for v in vals.values()), clean(row.get("source_url"))),
        )
        n += 1
    return n


def main(directory: Path, reset: bool = False) -> None:
    directory = Path(directory)
    if not directory.is_dir():
        raise SystemExit(f"{directory} is not a directory")
    sample = is_sample_dir(directory)
    print(f"Loading {directory} ({'SAMPLE' if sample else 'real'} data)")
    with connect() as conn, conn.cursor() as cur:
        if reset:
            reset_all(cur)
        elif not sample:
            purge_sample(cur)
        print(f"  parents:  {load_parents(cur, read_csv(directory, 'parents.csv'))}")
        print(f"  entities: {load_entities(cur, read_csv(directory, 'entities.csv'))}")
        n, skipped = load_projects(cur, read_csv(directory, 'projects.csv'), sample)
        print(f"  projects: {n}")
        print(f"  events:   {load_events(cur, read_csv(directory, 'evidence_events.csv'), skipped)}")
        print(f"  ercot:    {load_ercot(cur, read_csv(directory, 'ercot_queue.csv'))}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True, help="data/seed or data/sample")
    ap.add_argument("--reset", action="store_true", help="truncate all GridSight tables first")
    args = ap.parse_args()
    main(Path(args.dir), args.reset)
    sys.exit(0)
