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

# Allowed evidence event types -> the source that publishes that record in each state. The Texas
# entry is the original spec pairing (section 4.3). Another state adds its own record of the same
# kind: a Virginia DEQ generator air permit is a `permit_filed` event, as a TCEQ permit is in Texas.
# "*" means any state. A pairing not listed here fails the load.
EVENT_SOURCES: dict[str, dict[str, str]] = {
    "building_registered": {"TX": "TDLR"},
    "square_footage": {"TX": "TDLR"},
    "tenant_named": {"TX": "TDLR"},
    "inspection_done": {"TX": "TDLR"},
    "certified": {"TX": "COMPTROLLER", "IL": "IL_DCEO", "MN": "MN_DEED"},
    "permit_filed": {"TX": "TCEQ", "VA": "VA_DEQ"},
    "status_change": {"*": "OTHER"},
    # National layer: a data center mapped in the IM3 Open Source Data Center Atlas
    # (OpenStreetMap). value_num = building footprint in sq ft. No scoring factor uses it.
    "site_mapped": {"*": "OSM"},
}
# The evidence role each event type plays (docs/us-expansion-plan.md section 5). A factor scores a
# role, so a permit from any state's air agency counts the same way.
EVENT_ROLES: dict[str, str] = {
    "building_registered": "building_record", "square_footage": "building_record",
    "tenant_named": "tenant_named", "inspection_done": "inspection", "certified": "incentive_registry",
    "permit_filed": "air_permit", "status_change": "status", "site_mapped": "dc_location_layer",
}
# Texas pairing, kept for callers that only know Texas records.
EVENT_TYPES: dict[str, str] = {et: m.get("TX", m.get("*")) for et, m in EVENT_SOURCES.items()}
SOURCES = {src for m in EVENT_SOURCES.values() for src in m.values()}
# The state whose records each source publishes (None: any state).
SOURCE_STATE: dict[str, str | None] = {"TDLR": "TX", "COMPTROLLER": "TX", "TCEQ": "TX", "VA_DEQ": "VA",
                                       "IL_DCEO": "IL", "MN_DEED": "MN",
                                       "OSM": None, "OTHER": None}


def source_allowed(event_type: str, source: str, state: str) -> bool:
    """True when `source` publishes `event_type` records for projects in `state`."""
    pairs = EVENT_SOURCES.get(event_type, {})
    return pairs.get(state) == source or pairs.get("*") == source


# STATE_REGISTRY: the organization is named in a state incentive registry's own company text.
RESOLVED_BY = {"COMPTROLLER", "TDLR_TENANT", "TDLR_OWNER", "OSM_OPERATOR", "STATE_REGISTRY", "MANUAL"}

# Checklist factors (spec section 6). Order is display order. Most factors come from a Texas record
# type (TDLR, Comptroller); the air-permit factor counts any state's permit_filed record (role
# air_permit: TCEQ in Texas, DEQ in Virginia).
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
    {"key": "comptroller_certified", "points": 15, "event_type": "certified", "min_count": 1, "role": "incentive_registry",
     "rule": "Certified by a state data-center incentive program (Texas Comptroller, Illinois DCEO, Minnesota DEED)"},
    # The key stays tceq_permit so stored Texas factor flags are unchanged.
    {"key": "tceq_permit", "points": 15, "event_type": "permit_filed", "min_count": 1, "role": "air_permit",
     "rule": "A state air permit for the site has been filed (TCEQ in Texas, DEQ in Virginia)"},
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
