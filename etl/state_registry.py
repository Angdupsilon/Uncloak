"""Shared rules for the state data-center incentive registries (import_il_dceo.py, import_mn_deed.py, ...).

Each importer turns one state's published list into data/seed_states/<source>/ rows, the way
import_comptroller.py does for Texas:
  project  = one per certified data center, from the record itself (no coordinates unless the record
             states an address). A record is attached to an existing mapped site instead only on a
             confirmed match: the same organization and the record's own address within 250 m.
  entity   = the company as published, suffixed with the program ("... (IL DCEO)") so it never
             overwrites a Texas registered entity with the same text
  parent   = a known organization whose name the company text itself states (see resolve_parent);
             otherwise unresolved. A company name is never expanded into a brand it doesn't name.
  event    = one `certified` event per record, with the state's source key
Every record is also written to data/raw/<source>_review.csv with its possible mapped duplicates
(same organization, same state), which are listed for review and never merged.
"""
from __future__ import annotations

import csv
import math
import re
from pathlib import Path

from import_comptroller import KNOWN_COMPANIES, OTHER_PARENT_COLOR, display_name

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
SEED_DIRS = [ROOT / "data" / "seed", ROOT / "data" / "seed_national"]
MAX_M = 250


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9@ ]+", " ", (s or "").lower())).strip()


def read(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, header: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def known_parents() -> dict[str, str]:
    """Existing organization names (Texas seed, national layer, known companies), keyed by norm()."""
    names = {p for _, p, _ in KNOWN_COMPANIES}
    for d in SEED_DIRS:
        if (d / "parents.csv").exists():
            names |= {r["name"] for r in read(d / "parents.csv")}
    return {norm(n): n for n in names if n}


def parent_color(parent: str) -> str:
    for d in SEED_DIRS:
        if (d / "parents.csv").exists():
            for r in read(d / "parents.csv"):
                if r["name"] == parent and r.get("color_hex"):
                    return r["color_hex"]
    return OTHER_PARENT_COLOR


def resolve_parent(company: str, parents: dict[str, str], aliases: dict[str, str] | None = None) -> tuple[str | None, str]:
    """The organization a company name states, with the basis. Order:
    1. a known end-user company named in the text (KNOWN_COMPANIES)
    2. the name (legal suffix dropped) equals an existing organization, ignoring case/punctuation
    3. the name starts with an existing organization's full name ("Digital Realty Trust" ->
       Digital Realty); single-word names need 6+ letters so short tokens don't match by accident
    4. a brand abbreviation written in the text (the importer's `aliases`, e.g. "(QTS)")
    Otherwise None: the company stays its own registered entity with no organization."""
    for pattern, parent, _ in KNOWN_COMPANIES:
        if re.search(pattern, company, re.IGNORECASE):
            return parent, f"names {parent}"
    shown = norm(display_name(company))
    if shown in parents:
        return parents[shown], "same name as an existing organization"
    prefixes = sorted((k for k in parents if (" " in k or len(k) >= 6) and shown.startswith(k + " ")), key=len, reverse=True)
    if prefixes:
        return parents[prefixes[0]], f"name starts with {parents[prefixes[0]]}"
    text = f" {norm(company)} "
    for alias, parent in (aliases or {}).items():
        if f" {norm(alias)} " in text or norm(alias) in text.replace(" ", ""):
            return parent, f"names {alias.strip()}"
    return None, "no organization named in the record"


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def mapped_sites(state: str) -> list[dict]:
    """Atlas sites in a state, with their organization."""
    nat = ROOT / "data" / "seed_national"
    parent_of = {r["llc_name"]: r["parent_name"] for r in read(nat / "entities.csv")}
    return [dict(p, parent=parent_of.get(p["llc_name"], "")) for p in read(nat / "projects.csv") if p["state"] == state]


def confirmed_site(parent: str | None, lat: str, lon: str, sites: list[dict], address: str = "") -> tuple[dict | None, str]:
    """The one same-organization mapped site within 250 m of the record's own address, if exactly one."""
    if not parent:
        return None, "no organization to compare"
    if not (lat and lon):
        return None, "the record's address could not be geocoded" if address else "the record states no address"
    same = [s for s in sites if s["parent"] == parent]
    near = sorted((haversine_m((float(lat), float(lon)), (float(s["lat"]), float(s["lon"]))), s["name"], i) for i, s in enumerate(same))
    within = [n for n in near if n[0] <= MAX_M]
    if len(within) == 1:
        return same[within[0][2]], f"same organization, {within[0][0]:.0f} m from the record's address"
    if within:
        return None, f"{len(within)} {parent} sites within {MAX_M} m; which one the record covers isn't stated"
    return None, f"nearest {parent} site is {near[0][0]:.0f} m away" if near else f"no {parent} site mapped in the state"


def write_outputs(source_dir: str, parents: dict[str, str], entities: dict[str, dict], projects: list[dict],
                  events: list[dict], review: list[dict], review_name: str) -> Path:
    out = ROOT / "data" / "seed_states" / source_dir
    write_csv(out / "parents.csv", ["name", "color_hex"], [{"name": k, "color_hex": v} for k, v in sorted(parents.items())])
    write_csv(out / "entities.csv", ["llc_name", "parent_name", "resolved_by", "source_url"], sorted(entities.values(), key=lambda e: e["llc_name"]))
    write_csv(out / "projects.csv", ["name", "state", "county", "city", "address", "lat", "lon", "llc_name"], projects)
    write_csv(out / "evidence_events.csv", ["ts", "project_name", "source", "event_type", "value_num", "payload_json", "source_url"], events)
    write_csv(RAW / review_name, list(review[0].keys()), review)
    return out
