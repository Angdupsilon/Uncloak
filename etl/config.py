"""Scoring weights, $/MW constant and backfill settings.

Everything the scoring model depends on lives here. score.py writes a copy of
this configuration to the `scoring_config` table on every backfill so the web
UI ("How scoring works") shows exactly what produced the stored scores.
"""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

# Allowed evidence event types -> expected source (spec section 4.3).
EVENT_TYPES: dict[str, str] = {
    "building_registered": "TDLR",
    "square_footage": "TDLR",
    "tenant_named": "TDLR",
    "inspection_done": "TDLR",
    "certified": "COMPTROLLER",
    "permit_filed": "TCEQ",
    "status_change": "OTHER",
}
SOURCES = {"TDLR", "COMPTROLLER", "TCEQ", "OTHER"}
RESOLVED_BY = {"COMPTROLLER", "TDLR_TENANT", "TDLR_OWNER", "MANUAL"}

# Checklist factors (spec section 6). Order is display order.
#   min_count: factor is true when the project has >= min_count events of event_type
#   min_sum:   factor is true when the sum of value_num over event_type >= min_sum
FACTORS: list[dict] = [
    {"key": "tdlr_registered", "points": 20, "event_type": "building_registered", "min_count": 1,
     "rule": "At least one TDLR building registration"},
    {"key": "multi_building", "points": 10, "event_type": "building_registered", "min_count": 2,
     "rule": "Two or more TDLR building registrations"},
    {"key": "value_over_500m", "points": 15, "event_type": "building_registered", "min_sum": 500_000_000,
     "rule": "Total registered construction value of at least $500M"},
    {"key": "tenant_named", "points": 20, "event_type": "tenant_named", "min_count": 1,
     "rule": "A tenant is named in a TDLR record"},
    {"key": "comptroller_certified", "points": 15, "event_type": "certified", "min_count": 1,
     "rule": "Certified by the Texas Comptroller data-center program"},
    {"key": "tceq_permit", "points": 15, "event_type": "permit_filed", "min_count": 1,
     "rule": "A TCEQ air permit has been filed"},
    {"key": "inspection_done", "points": 5, "event_type": "inspection_done", "min_count": 1,
     "rule": "A TDLR inspection has been completed"},
]
MAX_SCORE = sum(f["points"] for f in FACTORS)
assert MAX_SCORE == 100, "factor points must sum to 100"

# Construction cost (USD) per MW of IT load. <<FILL>> by the team via env.
# When unset, mw_est is stored as NULL (no MW estimate), never guessed.
# Default: Cushman & Wakefield 2026 Data Center Development Cost Guide (published 2026-09-03),
# US & Canada average all-in greenfield development cost of $17.6M per MW, excluding chips/GPUs.
# https://ir.cushmanwakefield.com/news/press-release-details/2026/Cushman--Wakefield-Releases-2026-Data-Center-Development-Cost-Guide-Citing-21-Rise-in-Per-MW-Construction-Costs/default.aspx
# It is a national all-in average (includes land); the guide notes Texas markets are among the
# cheapest, so MW estimates from Texas construction costs lean conservative.
MW_COST_DEFAULT_USD = 17_600_000
MW_COST_DEFAULT_SOURCE = "Cushman & Wakefield 2026 Data Center Development Cost Guide (US & Canada average, all-in, excl. chips/GPUs)"

_mw_env = os.getenv("MW_COST_PER_MW_USD", "").strip()
MW_COST_PER_MW_USD: float | None = float(_mw_env) if _mw_env else MW_COST_DEFAULT_USD
MW_COST_SOURCE: str | None = (os.getenv("MW_COST_SOURCE", "").strip() or "env") if _mw_env else MW_COST_DEFAULT_SOURCE

BACKFILL_START: date = date.fromisoformat(os.getenv("BACKFILL_START", "2024-01-01"))


def database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set (see .env.example)")
    return url


def use_sample_mw_cost(sample_dir: Path) -> None:
    """For --dir data/sample only: if MW_COST_PER_MW_USD is not configured, fall
    back to the placeholder in data/sample/SAMPLE_settings.env so the sample map
    has MW circles. The value is labelled 'SAMPLE placeholder' everywhere it is shown."""
    global MW_COST_PER_MW_USD, MW_COST_SOURCE
    if MW_COST_PER_MW_USD:
        return
    settings = sample_dir / "SAMPLE_settings.env"
    if not settings.exists():
        return
    for line in settings.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line.startswith("MW_COST_PER_MW_USD="):
            MW_COST_PER_MW_USD = float(line.split("=", 1)[1])
            MW_COST_SOURCE = "SAMPLE placeholder"
