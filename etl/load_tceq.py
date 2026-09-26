"""Parse a TCEQ bulk air-permit file into permit_filed evidence events.

Rows are matched to projects by normalized company name (against LLC name,
project name, or parent name) or, failing that, by county + normalized address.
Unmatched rows are printed for manual review.

Usage: python etl/load_tceq.py --file <<FILL: path to TCEQ bulk file>>
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from psycopg.types.json import Jsonb

from common import clean, connect, is_fill, normalize_address, normalize_name

# ---- Column names in the TCEQ bulk file. <<FILL>> by the team. -------------
COL_COMPANY = "<<FILL>>"      # permit holder / applicant name
COL_COUNTY = "<<FILL>>"       # county name
COL_ADDRESS = "<<FILL>>"      # site address or location description
COL_PERMIT_ID = "<<FILL>>"    # permit / authorization number
COL_DATE = "<<FILL>>"         # date the permit was filed / received
COL_URL = None                # optional: column with a link to the permit record
# Optional filter: only rows whose COL_FILTER contains one of FILTER_VALUES.
COL_FILTER = None
FILTER_VALUES: list[str] = []
# -----------------------------------------------------------------------------

ORIGIN = "tceq_bulk"


def read_file(path: Path) -> pd.DataFrame:
    if path.suffix.lower() in (".xlsx", ".xls"):
        return pd.read_excel(path, dtype=str)
    return pd.read_csv(path, dtype=str, keep_default_na=False, encoding_errors="replace")


def main(path: Path) -> int:
    required = {"COL_COMPANY": COL_COMPANY, "COL_COUNTY": COL_COUNTY, "COL_ADDRESS": COL_ADDRESS,
                "COL_PERMIT_ID": COL_PERMIT_ID, "COL_DATE": COL_DATE}
    unset = [k for k, v in required.items() if is_fill(v)]
    if unset:
        raise SystemExit(f"Set the TCEQ column names at the top of etl/load_tceq.py first: {', '.join(unset)}")
    df = read_file(path)
    missing = [c for c in required.values() if c not in df.columns]
    if missing:
        raise SystemExit(f"Columns not found in {path}: {missing}. Available: {list(df.columns)}")
    if COL_FILTER:
        df = df[df[COL_FILTER].str.contains("|".join(FILTER_VALUES), case=False, na=False)]

    with connect() as conn, conn.cursor() as cur:
        cur.execute("""SELECT p.project_id, p.name, p.county, p.address, e.llc_name, pa.name
                       FROM projects p LEFT JOIN entities e USING (entity_id)
                       LEFT JOIN parents pa USING (parent_id)""")
        by_name: dict[str, int] = {}
        by_loc: dict[tuple[str, str], int] = {}
        for pid, pname, county, address, llc, parent in cur.fetchall():
            for n in (llc, pname):  # parent names are too broad to match on alone
                if n:
                    by_name.setdefault(normalize_name(n), pid)
            if county and address:
                by_loc[(normalize_name(county), normalize_address(address))] = pid

        matched, unmatched = [], []
        for i, row in df.iterrows():
            company = normalize_name(row[COL_COMPANY])
            pid = by_name.get(company) if company else None
            if pid is None:
                pid = by_loc.get((normalize_name(row[COL_COUNTY]).replace(" county", ""),
                                  normalize_address(row[COL_ADDRESS])))
            ts_raw = clean(row[COL_DATE])
            if pid is None or not ts_raw:
                unmatched.append((i, row[COL_COMPANY], row[COL_COUNTY], row[COL_ADDRESS],
                                  "no date" if pid is not None else "no project match"))
                continue
            ts = pd.Timestamp(ts_raw)
            ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
            payload = {"permit_id": clean(row[COL_PERMIT_ID]), "company": clean(row[COL_COMPANY]),
                       "county": clean(row[COL_COUNTY]), "_origin": ORIGIN}
            url = clean(row[COL_URL]) if COL_URL else None
            matched.append((ts.to_pydatetime(), pid, payload, url))

        for ts, pid, payload, url in matched:
            cur.execute("""DELETE FROM evidence_events WHERE project_id = %s AND event_type = 'permit_filed'
                           AND payload->>'_origin' = %s AND payload->>'permit_id' IS NOT DISTINCT FROM %s""",
                        (pid, ORIGIN, payload["permit_id"]))
            cur.execute("""INSERT INTO evidence_events (ts, project_id, source, event_type, value_num, payload, source_url)
                           VALUES (%s, %s, 'TCEQ', 'permit_filed', NULL, %s, %s)""",
                        (ts, pid, Jsonb(payload), url))

    print(f"  tceq: {len(matched)} permit_filed events inserted, {len(unmatched)} rows unmatched")
    for i, company, county, address, why in unmatched:
        print(f"    UNMATCHED row {i + 2}: {company!r} | {county!r} | {address!r} ({why})")
    return len(matched)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", required=True, help="path to the TCEQ bulk file (.csv or .xlsx)")
    main(Path(ap.parse_args().file))
