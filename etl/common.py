"""Shared helpers for the ETL scripts."""
from __future__ import annotations

import json
import re
from typing import Any

import pandas as pd
import psycopg

import config

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
