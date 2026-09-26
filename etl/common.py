"""Shared helpers for the ETL scripts."""
from __future__ import annotations

import json
import re
from typing import Any

import pandas as pd
import psycopg

import config

# USPS code -> Census state FIPS (county FIPS start with it).
STATE_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10",
    "DC": "11", "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19",
    "KS": "20", "KY": "21", "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27",
    "MS": "28", "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35",
    "NY": "36", "NC": "37", "ND": "38", "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44",
    "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53",
    "WV": "54", "WI": "55", "WY": "56", "PR": "72",
}

FILL_RE = re.compile(r"<<\s*FILL", re.IGNORECASE)


def connect(autocommit: bool = False) -> psycopg.Connection:
    conn = psycopg.connect(config.database_url(), autocommit=autocommit)
    conn.execute("SET TIME ZONE 'UTC'")
    if not autocommit:
        conn.commit()
    return conn


def is_fill(value: Any) -> bool:
    return isinstance(value, str) and bool(FILL_RE.search(value))


def clean(value: Any) -> Any:
    """Normalize a CSV cell: NaN/blank/<<FILL>> -> None, strings stripped."""
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if isinstance(value, str):
        value = value.strip()
        if value == "" or is_fill(value):
            return None
    return value


def to_float(value: Any) -> float | None:
    value = clean(value)
    if value is None:
        return None
    return float(str(value).replace(",", "").replace("$", ""))


def strip_fill_json(obj: Any) -> Any:
    """Replace <<FILL>> placeholders inside a parsed JSON payload with null."""
    if isinstance(obj, dict):
        return {k: strip_fill_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [strip_fill_json(v) for v in obj]
    return None if is_fill(obj) else obj


def parse_payload(raw: Any) -> dict:
    raw = raw if isinstance(raw, str) else None
    if not raw or not raw.strip():
        return {}
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError(f"payload_json must be a JSON object, got: {raw!r}")
    return strip_fill_json(payload)


_SUFFIXES = re.compile(r"\b(llc|l\.l\.c|inc|incorporated|lp|l\.p|llp|ltd|corp|corporation|co|company)\b")


def normalize_name(name: Any) -> str:
    """Lowercase, drop punctuation and corporate suffixes, collapse whitespace."""
    if not isinstance(name, str):
        return ""
    s = _SUFFIXES.sub(" ", name.lower())
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def normalize_address(addr: Any) -> str:
    s = normalize_name(addr)
    for full, abbr in (("street", "st"), ("road", "rd"), ("avenue", "ave"), ("drive", "dr"),
                       ("highway", "hwy"), ("boulevard", "blvd"), ("lane", "ln"), ("county road", "cr")):
        s = re.sub(rf"\b{full}\b", abbr, s)
    return s
