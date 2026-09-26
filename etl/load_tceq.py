"""Parse a TCEQ bulk air-permit file into permit_filed evidence events.

Rows are matched to projects by normalized company name (against LLC name,
project name, or parent name) or, failing that, by county + normalized address.
Unmatched rows are printed for manual review.

Column names are auto-detected from common TCEQ exports and can be overridden with
``--company-col`` etc. No source-specific code edit is required.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
from psycopg.types.json import Jsonb

from common import clean, connect, normalize_address, normalize_name

ALIASES = {
    "company": ("company", "customer name", "applicant", "permit holder", "legal name"),
    "county": ("county", "county name"),
    "address": ("address", "site address", "physical address", "location"),
    "permit_id": ("permit number", "permit no", "registration number", "authorization number", "permit id"),
    "date": ("received date", "application received date", "issue date", "effective date", "date"),
    "url": ("source url", "document url", "url", "link"),
}

ORIGIN = "tceq_bulk"


def read_file(path: Path) -> pd.DataFrame:
    if path.suffix.lower() in (".xlsx", ".xls"):
        return pd.read_excel(path, dtype=str)
    return pd.read_csv(path, dtype=str, keep_default_na=False, encoding_errors="replace")


def detect(df: pd.DataFrame, key: str, override: str | None = None, required: bool = True) -> str | None:
    if override:
        if override not in df.columns:
            raise SystemExit(f"Column {override!r} not found. Available: {list(df.columns)}")
        return override
    normalized = {normalize_name(str(c)): str(c) for c in df.columns}
    for alias in ALIASES[key]:
        if normalize_name(alias) in normalized:
            return normalized[normalize_name(alias)]
    if required:
        raise SystemExit(f"Could not auto-detect the TCEQ {key} column. Available: {list(df.columns)}; pass --{key.replace('_','-')}-col")
    return None


def main(path: Path, columns: dict[str, str | None] | None = None) -> int:
    df = read_file(path)
    overrides = columns or {}
    col = {key: detect(df, key, overrides.get(key), key != "url") for key in ALIASES}

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
            company = normalize_name(row[col["company"]])
            pid = by_name.get(company) if company else None
            if pid is None:
                pid = by_loc.get((normalize_name(row[col["county"]]).replace(" county", ""),
                                  normalize_address(row[col["address"]])))
            ts_raw = clean(row[col["date"]])
            if pid is None or not ts_raw:
                unmatched.append((i, row[col["company"]], row[col["county"]], row[col["address"]],
                                  "no date" if pid is not None else "no project match"))
                continue
            ts = pd.Timestamp(ts_raw)
            ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
            payload = {"permit_id": clean(row[col["permit_id"]]), "company": clean(row[col["company"]]),
                       "county": clean(row[col["county"]]), "address": clean(row[col["address"]]), "_origin": ORIGIN}
            url = clean(row[col["url"]]) if col["url"] else None
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
    for key in ALIASES:
        ap.add_argument(f"--{key.replace('_','-')}-col")
    args = ap.parse_args()
    main(Path(args.file), {key: getattr(args, f"{key}_col") for key in ALIASES})
