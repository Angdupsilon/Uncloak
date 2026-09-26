"""Convert the Texas Comptroller data-center registry snapshot into data/seed rows.

Input: data/raw/comptroller_data_centers_<date>.csv (see data/raw/README.md).
Output: rows merged into data/seed/{parents,entities,projects,evidence_events}.csv.
Rows this script generated before are replaced; hand-entered rows are kept.

Mapping (everything comes from the registry record itself, nothing is inferred):
  project  = one per data-center name (a site listed in both programs gets one project
             with two certification events)
  entity   = the registered owner as published (the occupant if the owner cell is blank),
             taken from the project's most recent registration
  parent   = 1) a known end-user company named in the occupant, operator or owner fields
                (KNOWN_COMPANIES below, occupant first), else
             2) the occupant (the registered tenant), if it differs from the owner, else
             3) none -> "Unresolved". Operators are not used as a fallback: in this
                registry they are mostly sibling LLCs or property managers.
  event    = one `certified` COMPTROLLER event per registration, dated at its effective
             date, with the full record in the payload
The registry has no addresses, so projects load without coordinates.

Usage: python etl/import_comptroller.py --file data/raw/comptroller_data_centers_2026-09-26.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "seed"

# (pattern on the published name, parent display name, chip colour)
KNOWN_COMPANIES: list[tuple[str, str, str]] = [
    (r"\bgoogle\b", "Google", "#4285F4"),
    (r"\bamazon\b", "Amazon", "#FF9900"),
    (r"\bmicrosoft\b", "Microsoft", "#00A4EF"),
    (r"\boracle\b", "Oracle", "#C74634"),
    (r"\bmeta platforms\b|\bfacebook\b", "Meta", "#0866FF"),
    (r"\bopenai\b", "OpenAI", "#10A37F"),
    (r"\banthropic\b", "Anthropic", "#D97757"),
    (r"\bx\.?ai\b", "xAI", "#000000"),
    (r"\bcoreweave\b", "CoreWeave", "#5B3FD9"),
    (r"\blambda\b", "Lambda", "#7E57C2"),
    (r"\btesla\b", "Tesla", "#CC0000"),
]
OTHER_PARENT_COLOR = "#78909C"

PROGRAM_LABEL = {
    "qualifying_data_center": "Qualifying Data Center",
    "qualifying_large_data_center_project": "Qualifying Large Data Center Project",
}

_SUFFIX = re.compile(
    r"[,\s]+(l\.?l\.?c\.?|inc\.?|incorporated|corporation|corp\.?|co\.?|l\.?p\.?|ltd\.?|pbc|n\.?a\.?|"
    r"national association)$",
    re.IGNORECASE,
)


def split_names(cell: str) -> list[str]:
    return [p.strip() for p in (cell or "").split(";") if p.strip()]


def display_name(name: str) -> str:
    """Drop trailing legal suffixes: 'Riot Platforms, Inc.' -> 'Riot Platforms'."""
    s = name.strip().rstrip(".").strip()
    prev = None
    while prev != s:
        prev, s = s, _SUFFIX.sub("", s).strip().rstrip(",").strip()
    return s or name.strip()


def key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", display_name(name).lower())


def iso(d: str) -> str | None:
    return datetime.strptime(d, "%m/%d/%Y").date().isoformat() if d else None


def resolve_parent(owner: str, occupant: str, operator: str) -> tuple[str | None, str, str]:
    """Return (parent, color, reason)."""
    for field, cell in (("occupant", occupant), ("operator", operator), ("owner", owner)):
        for name in split_names(cell):
            for pattern, parent, color in KNOWN_COMPANIES:
                if re.search(pattern, name, re.IGNORECASE):
                    return parent, color, f"{field} names {name}"
    owner_keys = {key(n) for n in split_names(owner)}
    names = split_names(occupant)
    if names and key(names[0]) not in owner_keys:
        return display_name(names[0]), OTHER_PARENT_COLOR, f"occupant is {names[0]}"
    return None, "", "occupant is the owner itself"


def build(raw: pd.DataFrame):
    raw = raw.fillna("")
    raw["_eff"] = raw["Effective Date"].map(iso)
    raw["_key"] = raw["Data Center"].str.strip().str.lower()
    projects, entities, parents, events, notes = {}, {}, {}, [], []
    canonical: dict[str, str] = {}  # key(parent) -> first spelling seen, so case variants merge

    for _, grp in raw.groupby("_key", sort=False):
        grp = grp.sort_values("_eff")
        latest = grp.iloc[-1]
        name = latest["Data Center"].strip()
        owner = latest["Owner Name"]
        llc = owner or latest["Occupant Name"] or latest["Operator Name"]
        parent, color, reason = resolve_parent(owner, latest["Occupant Name"], latest["Operator Name"])
        if parent:
            parent = canonical.setdefault(key(parent), parent)
        if len(grp) > 1:
            notes.append(f"merged {len(grp)} registrations for {name!r} ({', '.join(grp['program'])})")
        if not owner:
            notes.append(f"{name!r}: owner blank in registry, entity = {llc!r}")

        prev = entities.get(llc)
        if prev and prev["parent_name"] != (parent or ""):
            notes.append(f"CONFLICT entity {llc!r}: parent {prev['parent_name']!r} vs {parent!r} "
                         f"(kept the most recent registration)")
            if prev["_eff"] > latest["_eff"]:
                parent, color, reason = prev["parent_name"] or None, "", prev["_reason"]
        entities[llc] = {"llc_name": llc, "parent_name": parent or "", "resolved_by": "COMPTROLLER" if parent else "",
                         "source_url": latest["source_url"], "_eff": latest["_eff"], "_reason": reason}
        if parent and parent not in parents:
            parents[parent] = color or OTHER_PARENT_COLOR  # pruned below to parents still in use
        projects[name] = {"name": name, "county": "", "city": "", "address": "", "lat": "", "lon": "", "llc_name": llc,
                          "_parent": parent, "_reason": reason}

        for _, r in grp.iterrows():
            payload = {
                "program": PROGRAM_LABEL.get(r["program"], r["program"]),
                "owner": r["Owner Name"] or None,
                "owner_registration": r["Owner Registration Number"] or None,
                "occupant": r["Occupant Name"] or None,
                "occupant_registration": r["Occupant Registration Number"] or None,
                "operator": r["Operator Name"] or None,
                "operator_registration": r["Operator Registration Number"] or None,
                "exemption_end_date": iso(r["Exemption End Date"]),
                "retrieved": r["retrieved"],
            }
            events.append({"ts": r["_eff"], "project_name": name, "source": "COMPTROLLER", "event_type": "certified",
                           "value_num": "", "payload_json": json.dumps(payload), "source_url": r["source_url"]})
    # An entity shared by several sites keeps only its most recent parent, so drop parents
    # that no entity ends up using.
    used = {e["parent_name"] for e in entities.values() if e["parent_name"]}
    parents = {p: c for p, c in parents.items() if p in used}
    return projects, entities, parents, events, notes


def merge_csv(path: Path, header: list[str], new_rows: list[dict], is_generated) -> tuple[int, int]:
    existing = list(csv.DictReader(path.open())) if path.exists() else []
    kept = [r for r in existing if not is_generated(r)]
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
        w.writeheader()
        w.writerows(kept)
        w.writerows(new_rows)
    return len(kept), len(new_rows)


def main(file: Path, seed: Path = SEED) -> None:
    raw = pd.read_csv(file, dtype=str, keep_default_na=False)
    projects, entities, parents, events, notes = build(raw)
    names, llcs = set(projects), set(entities)

    existing_parents = {r["name"]: r for r in csv.DictReader((seed / "parents.csv").open())}
    parent_rows = [{"name": p, "color_hex": existing_parents.get(p, {}).get("color_hex") or c} for p, c in parents.items()]
    print("parents:  kept %d, wrote %d" % merge_csv(seed / "parents.csv", ["name", "color_hex"], parent_rows,
                                                   lambda r: r["name"] in parents))
    print("entities: kept %d, wrote %d" % merge_csv(seed / "entities.csv", ["llc_name", "parent_name", "resolved_by", "source_url"],
                                                   list(entities.values()), lambda r: r["llc_name"] in llcs))
    print("projects: kept %d, wrote %d" % merge_csv(seed / "projects.csv", ["name", "county", "city", "address", "lat", "lon", "llc_name"],
                                                   list(projects.values()), lambda r: r["name"] in names))
    print("events:   kept %d, wrote %d" % merge_csv(
        seed / "evidence_events.csv", ["ts", "project_name", "source", "event_type", "value_num", "payload_json", "source_url"],
        events, lambda r: r["project_name"] in names and r["source"] == "COMPTROLLER"))

    resolved = [p for p in projects.values() if p["_parent"]]
    print(f"\n{len(projects)} projects from {len(raw)} registrations; parent resolved for {len(resolved)}, "
          f"unresolved {len(projects) - len(resolved)}")
    by_parent = pd.Series([p["_parent"] or "Unresolved" for p in projects.values()]).value_counts()
    print(by_parent.to_string())
    for n in notes:
        print("  NOTE", n)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", required=True, type=Path)
    main(ap.parse_args().file)
