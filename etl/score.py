"""Evidence-index scoring and weekly backfill.

score(project_id, as_of) uses only evidence events with ts on or before as_of
(inclusive of the whole as_of day, UTC). The backfill writes one project_scores
row per project per Monday from BACKFILL_START to today (plus today itself if
today is not a Monday) for every project with at least one event by that date,
then refreshes the weekly_project_state continuous aggregate.

Usage: python etl/score.py [--project ID --as-of YYYY-MM-DD]
"""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, time, timedelta, timezone

import pandas as pd
from psycopg.types.json import Jsonb

import config
from common import connect


def _day_end(d: date) -> datetime:
    return datetime.combine(d + timedelta(days=1), time.min, tzinfo=timezone.utc)


def score_events(events: pd.DataFrame) -> dict:
    """Score a project from its events (already filtered to ts <= as_of).

    `events` needs columns event_type and value_num. Returns
    {score, probability, mw_est, factors, total_cost}.
    """
    counts = events["event_type"].value_counts()
    sums = events.groupby("event_type")["value_num"].sum(min_count=1)
    factors: dict[str, bool] = {}
    points = 0
    for f in config.FACTORS:
        et = f["event_type"]
        if "min_sum" in f:
            total = sums.get(et)
            hit = total is not None and not pd.isna(total) and total >= f["min_sum"]
        else:
            hit = int(counts.get(et, 0)) >= f["min_count"]
        factors[f["key"]] = bool(hit)
        points += f["points"] if hit else 0

    cost = sums.get("building_registered")
    total_cost = None if cost is None or pd.isna(cost) or cost <= 0 else float(cost)
    mw_est = total_cost / config.MW_COST_PER_MW_USD if total_cost and config.MW_COST_PER_MW_USD else None
    return {
        "score": int(points),
        "probability": points / config.MAX_SCORE,
        "mw_est": mw_est,
        "factors": factors,
        "total_cost": total_cost,
    }


def fetch_events(conn, project_id: int | None = None) -> pd.DataFrame:
    sql = "SELECT ts, project_id, event_type, value_num FROM evidence_events"
    params: tuple = ()
    if project_id is not None:
        sql += " WHERE project_id = %s"
        params = (project_id,)
    with conn.cursor() as cur:
        cur.execute(sql + " ORDER BY ts", params)
        rows = cur.fetchall()
    df = pd.DataFrame(rows, columns=["ts", "project_id", "event_type", "value_num"])
    if not df.empty:
        df["ts"] = pd.to_datetime(df["ts"], utc=True)
        df["value_num"] = pd.to_numeric(df["value_num"])
    return df


def score(project_id: int, as_of: date, conn=None) -> dict:
    """Score one project as of a date, using only events on or before that date."""
    own = conn is None
    conn = conn or connect()
    try:
        ev = fetch_events(conn, project_id)
    finally:
        if own:
            conn.close()
    ev = ev[ev["ts"] < pd.Timestamp(_day_end(as_of))] if not ev.empty else ev
    return score_events(ev)


def backfill_dates(start: date, today: date) -> list[date]:
    first_monday = start + timedelta(days=(7 - start.weekday()) % 7)
    dates = []
    d = first_monday
    while d <= today:
        dates.append(d)
        d += timedelta(days=7)
    if not dates or dates[-1] != today:
        dates.append(today)
    return dates


def write_config(cur) -> None:
    cur.execute(
        """INSERT INTO scoring_config (id, factors, mw_cost_per_mw_usd, mw_cost_source, backfill_start, computed_at)
           VALUES (1, %s, %s, %s, %s, now())
           ON CONFLICT (id) DO UPDATE SET factors = EXCLUDED.factors,
             mw_cost_per_mw_usd = EXCLUDED.mw_cost_per_mw_usd, mw_cost_source = EXCLUDED.mw_cost_source,
             backfill_start = EXCLUDED.backfill_start, computed_at = now()""",
        (Jsonb(config.FACTORS), config.MW_COST_PER_MW_USD, config.MW_COST_SOURCE, config.BACKFILL_START),
    )


def refresh_aggregate() -> None:
    # CALL refresh_continuous_aggregate cannot run inside a transaction block.
    with connect(autocommit=True) as conn:
        conn.execute("CALL refresh_continuous_aggregate('weekly_project_state', NULL, NULL)")


def backfill(today: date | None = None) -> int:
    today = today or datetime.now(timezone.utc).date()
    if config.MW_COST_PER_MW_USD is None:
        print("  NOTE MW_COST_PER_MW_USD is not set: mw_est will be NULL (no MW / GW figures)")
    with connect() as conn:
        events = fetch_events(conn)
        rows = []
        if not events.empty:
            for d in backfill_dates(config.BACKFILL_START, today):
                cutoff = pd.Timestamp(_day_end(d))
                upto = events[events["ts"] < cutoff]
                ts = datetime.combine(d, time.min, tzinfo=timezone.utc)
                for pid, ev in upto.groupby("project_id"):
                    s = score_events(ev)
                    rows.append((ts, int(pid), s["score"], s["probability"], s["mw_est"], Jsonb(s["factors"])))
        with conn.cursor() as cur:
            cur.execute("DELETE FROM project_scores")  # idempotent: delete-then-insert
            with cur.copy("COPY project_scores (ts, project_id, score, probability, mw_est, factors) FROM STDIN") as cp:
                for r in rows:
                    cp.write_row(r)
            write_config(cur)
    refresh_aggregate()
    print(f"  backfill: {len(rows)} project_scores rows, {config.BACKFILL_START} -> {today}")
    return len(rows)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--project", type=int, help="score a single project instead of running the backfill")
    ap.add_argument("--as-of", type=date.fromisoformat, default=None)
    ap.add_argument("--sample-dir", default=None, help="use the SAMPLE $/MW placeholder from this dir if env is unset")
    args = ap.parse_args()
    if args.sample_dir:
        from pathlib import Path
        config.use_sample_mw_cost(Path(args.sample_dir))
    if args.project is not None:
        result = score(args.project, args.as_of or datetime.now(timezone.utc).date())
        print(json.dumps(result, indent=2))
    else:
        backfill(args.as_of)
