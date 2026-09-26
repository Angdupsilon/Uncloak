"""Run the whole pipeline: schema check -> load -> (TCEQ) -> geocode -> backfill -> aggregate refresh.

Usage:
  python etl/run_all.py --dir data/sample
  python etl/run_all.py --dir data/seed [--tceq-file path] [--skip-geocode] [--reset]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import config
import geocode
import load_seed
import load_tceq
import score
import sync_dimensions
from common import connect

REQUIRED = ["parents", "entities", "projects", "evidence_events", "project_scores",
            "ercot_queue", "scoring_config", "sites", "project_sites", "project_status_history",
            "entity_parent_history", "capacity_observations", "ercot_project_links",
            "source_refreshes", "weekly_project_state", "weekly_realistic_demand"]


def schema_check() -> None:
    with connect() as conn, conn.cursor() as cur:
        missing = []
        for name in REQUIRED:
            cur.execute("SELECT to_regclass(%s)", (name,))
            if cur.fetchone()[0] is None:
                missing.append(name)
        if missing:
            raise SystemExit(
                f"Missing database objects: {missing}.\n"
                "Run db/004_data_quality.sql for an existing database, or db/001_schema.sql + "
                "db/002_timescale.sql + db/003_readonly_role.sql for a new database.")
        cur.execute("SELECT hypertable_name FROM timescaledb_information.hypertables")
        hts = {r[0] for r in cur.fetchall()}
        for t in ("evidence_events", "project_scores", "ercot_queue"):
            if t not in hts:
                print(f"  WARN {t} is not a hypertable (did db/002_timescale.sql run?)")
    print("  schema: ok")


def summary() -> None:
    with connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*), count(*) FILTER (WHERE is_sample) FROM projects")
        projects, sample = cur.fetchone()
        cur.execute("SELECT count(*) FROM evidence_events")
        events = cur.fetchone()[0]
        cur.execute("SELECT week, realistic_gw, found_gw, projects FROM weekly_realistic_demand ORDER BY week DESC LIMIT 1")
        latest = cur.fetchone()
    print("\n=== GridSight summary ===")
    print(f"projects:        {projects}" + (f" ({sample} SAMPLE)" if sample else ""))
    print(f"evidence events: {events}")
    if latest:
        week, realistic, found, n = latest
        fmt = lambda v: "n/a (MW_COST_PER_MW_USD unset)" if v is None or not config.MW_COST_PER_MW_USD else f"{v:.3f} GW"
        print(f"latest week:     {week:%Y-%m-%d} ({n} projects scored)")
        print(f"realistic_gw:    {fmt(realistic)}")
        print(f"found_gw:        {fmt(found)}")
    else:
        print("latest week:     (no scores yet)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", required=True, help="data/seed or data/sample")
    ap.add_argument("--tceq-file", help="optional TCEQ bulk file to load after the seed")
    ap.add_argument("--skip-geocode", action="store_true")
    ap.add_argument("--reset", action="store_true", help="truncate all GridSight tables before loading")
    args = ap.parse_args()
    directory = Path(args.dir)
    if load_seed.is_sample_dir(directory):
        config.use_sample_mw_cost(directory)

    print("1/6 schema check")
    schema_check()
    print("2/6 load seed")
    load_seed.main(directory, args.reset)
    if args.tceq_file:
        print("    load TCEQ")
        load_tceq.main(Path(args.tceq_file))
    print("3/6 geocode")
    if args.skip_geocode:
        print("  skipped")
    else:
        geocode.main()
    print("4/6 sync canonical sites, provenance, lifecycle and links")
    sync_dimensions.main(directory)
    print("5/6 backfill scores + 6/6 refresh continuous aggregate")
    score.backfill()
    summary()


if __name__ == "__main__":
    main()
